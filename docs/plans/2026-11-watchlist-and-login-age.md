# Plan: Watchlist (local sniper/cheater tags) and login age

Status: proposed on 2026-11-18, waiting for the owner's OK. Target version
5.2.0. Written by the lead; to be implemented task by task, one
commit per task. Read `AGENTS.md` first.

## Goals

1. **Login age** (idea from a player): show how long ago a player logged in to
   Pika, from the `lastSeen` field of the profile the overlay already
   downloads. A low-level account that logged in a minute ago, in your lobby
   right after you requeued, is very likely a sniper.
2. **Watchlist** (owner's idea, extended): tag players locally as Sniper,
   Cheater or Other, with a note. Stored in a local file, no server. Lists can
   be exported and imported, so friends can share them.
3. **Tags column**: every chip (YOU, BOT?, FRESH, login age, watchlist) lives in
   one dedicated column, so chips line up across rows (the owner asked for
   aligned tags on 2026-11-14).

Not in scope: any server or online sync, automatic reporting, UUID-based
identity (Pika accepts cracked accounts, so a Mojang UUID is not reliable).

## Facts the plan relies on

- `GET /api/profile/{name}` returns `lastSeen` (epoch milliseconds) among
  `discord_verified, lastSeen, ranks, email_verified, discord_boosting, clan,
  skin, rank, friends, username`. No UUID field. Observed 2026-11-14.
- The profile is already fetched for every lookup and cached 10 minutes
  (`src/main/api/apiClient.ts`, `cache.ts`), so login age costs **zero extra
  requests**.
- **Semantics of `lastSeen` are not known.** On 2026-11-14 three players who
  were online in the same hub had `lastSeen` about 4 minutes, 20 minutes and
  28 hours before the moment they were seen. So it is not "updated while
  online"; it is either the last login or the last logout. Task 0 settles it.
- Player rows render as HTML strings (`renderer/ts/table/cells.ts`,
  `rowBuilder.ts`, `statusRow.ts`) escaped with `esc()`. Anything imported from
  a file (names, notes) must go through `esc()`.
- Columns: `src/shared/columns.ts`; visible list and fitting:
  `renderer/ts/table/header.ts`, `fit.ts` (drops columns from the right, never
  `player`). Status rows keep every cell up to `player` plus `guild`
  (`statusRow.ts`, pills share one left edge).
- Config: `src/main/config.ts` (validation, column merge for new columns,
  atomic write through a temp file). Settings window: ADR-0013,
  `renderer/ts/settings/`, broadcast of state to both windows:
  `src/main/broadcast.ts`.

## Task 0 — find out what `lastSeen` means (owner-assisted, blocks the wording of task 2 only)

- Add `scripts/last-seen-probe.mjs <name> [--every 60] [--minutes 20]`: reads
  the key from `PIKA_API_KEY`, polls the profile once per interval, prints
  local time, raw `lastSeen`, its ISO time and its age. One request per
  minute.
- Ask the owner to run it on their own name and, while it runs: stay offline
  3 minutes, log in to Pika and stay 10 minutes, log out, wait 3 minutes.
- Read the output:
  - value jumps to the login time and stays → **last login**: chip text "12m"
    means "logged in 12 minutes ago";
  - value changes only at logout → **last logout**: for an online player it is
    the end of their previous session; "1m" then means "was offline until a
    minute ago" (still a relog signal); wording becomes "back 1m ago";
  - anything else → stop and report to the owner; ship the watchlist without
    login age.
- Record the result in `docs/API-CLIENT.md` (Verified facts) with the date.

## Task 1 — Tags column (UI refactor, no new data)

- New column `{ id: 'tags', label: 'Tags', sortKey: null, cls: 'col-tags' }`
  placed right after `player` in `COLUMN_DEFS`; fixed width in `COL_WIDTH`
  (172 px at the 10px chip size: CHEATER + FRESH 99m chips side by side;
  was 92 px, which clipped the second chip); enabled by default and part of
  the default compact set.
- Config migration: existing `columnOrder` without `tags` gets it inserted
  right after `player` (extend the existing column merge, with a test).
- Move the YOU and BOT? chips from the player cell to the tags cell. Chips sit
  left-aligned in the cell, in a fixed order: YOU, watchlist, FRESH/age, BOT?;
  overflow is clipped with the full list in the cell's `title`.
- `statusRow.ts`: the tags cell is rendered for status rows too (a nicked
  player can be on the watchlist), before the pill cell; pills still share one
  left edge. Extend the alignment check in the tests or screenshots.
- `fit.ts`: no change needed (tags sits before the dropped columns). Verify in
  the narrow screenshot that it survives before the stat columns.

## Task 2 — Login age chip

- Main: `profileInfo` (`src/main/api/statsExtractor.ts`) adds
  `lastSeen: number | null`; accept only a finite number between 2015-01-01
  and now + 5 minutes, else null. Add to `PlayerProfileInfo`
  (`src/shared/types.ts`). It travels on every status that carries profile
  info (ok, api_off, never_played, no_data).
- Renderer: pure `renderer/ts/table/loginAge.ts`:
  `loginAgeView(lastSeen, level, now, settings) → { text, fresh, title } | null`
  and `formatAge(ms)` ("<1m", "7m", "3h", "2d"). Display rule from settings:
  - `loginAge`: `'off' | 'lowLevel' | 'all'`, default `'lowLevel'`;
  - `loginAgeMaxLevel`: default 10 (shown only when level ≤ this, for
    `'lowLevel'`);
  - `freshMinutes`: default 5. Age ≤ this → highlighted FRESH chip
    ("FRESH 1m", warn tone); otherwise a dim age chip.
  - Title text follows Task 0 ("Logged in 3 minutes ago (Pika profile)").
- Ages move with time: while at least one visible row shows an age, re-render
  every 30 s; include the formatted age in the row signature
  (`rowBuilder.ts`) so only changed rows update. No timer when none is shown.
- Settings (validated in `config.ts`, controls in the Watchlist tab, Task 4):
  the three keys above.
- Optional and cheap if time allows: a `games` column (Games played is already
  extracted as `gamesPlayed`), default hidden.

## Task 3 — Watchlist store, import and export (main process)

Files under `src/main/watchlist/`, each ≤ ~150 lines, pure parts unit tested.

- **Model** (`types.ts`, shared types in `src/shared/`):
  ```ts
  type WatchKind = 'sniper' | 'cheater' | 'other';
  interface WatchEntry {
      name: string;          // as entered/detected, key = name.toLowerCase()
      kind: WatchKind;
      note: string;          // ≤ 120 chars, control characters stripped
      addedAt: number;       // epoch ms
      source: 'me' | string; // 'me' or the id of an imported list
  }
  interface ImportedList { id: string; label: string; importedAt: number; count: number }
  interface NickLink {
      nick: string;          // the nick as seen in the log, key = nick.toLowerCase()
      friend: string;        // the real name of the teammate, '' when not given
      addedAt: number;
  }
  interface WatchlistFile { version: 1; entries: WatchEntry[]; lists: ImportedList[]; nickLinks: NickLink[] }
  ```
- **Store** (`store.ts`): `%APPDATA%\pika-overlay\watchlist.json`; load once at
  startup; atomic write (temp file + rename, as `config.ts`); a corrupt file is
  renamed to `watchlist.json.bad-<timestamp>` and the app starts with an empty
  list (logged, never a crash). Lookup by lowercase name. When the same name
  exists from several sources, the owner's own entry (`source: 'me'`) wins;
  otherwise the most recent import.
- **Validation** (`validate.ts`, pure): names `^[A-Za-z0-9_]{3,16}$`; unknown
  kind → `other`; note trimmed, control characters removed, cut at 120; at most
  5000 entries per file and 1 MB per file; duplicates collapse to one.
- **Export/import formats** (`format.ts`, pure):
  - File: JSON
    `{ "format": "pika-overlay-watchlist", "version": 1, "exportedAt": …, "entries": [{ "name", "kind", "note", "addedAt" }] }`,
    extension `.json`, default name `pika-watchlist-YYYY-MM-DD.json`.
    Export writes the owner's own entries only (not other people's lists,
    unless "include imported lists" is ticked).
  - Text, for pasting in Discord: one entry per line
    `name, kind, note` (kind and note optional, `#` starts a comment). The
    parser accepts both this and a bare list of names (kind chosen in the
    import dialog, default `other`).
  - Import never overwrites the owner's own entries. It creates an
    `ImportedList` (label = file name or "Pasted list <date>") whose entries are
    stored with its `source` id, so the whole list can be removed in one click.
    Importing a file with the same label again replaces that list.
- **IPC** (`src/shared/ipc-contract.ts`, preload, `src/main/ipc/`), with type
  checks on every argument like the existing handlers:
  - `watchlist:get` → `{ entries, lists }`;
  - `watchlist:set(name, { kind, note } | null)` → own entry added, changed or
    removed;
  - `watchlist:removeList(id)`;
  - `watchlist:export({ includeImported })` → save dialog, returns the path or
    null;
  - `watchlist:copyText()` → own entries as text on the clipboard;
  - `watchlist:importFile()` → open dialog, parse, return a preview
    `{ token, label, count, conflicts, invalid }` without saving;
    `watchlist:importText(text, defaultKind)` → same preview;
    `watchlist:confirmImport(token)` → saves; previews expire after 5 minutes;
  - `watchlist:linkNick(nick, friend | null)` → add or replace a nick link
    (friend name validated like any name, or empty); `watchlist:unlinkNick(nick)`;
    `watchlist:get` also returns `nickLinks`;
  - `watchlist:menu(name, nicked)` → row menu as data and `watchlist:menuPick(token, id)` (see Task 4; originally a native menu, replaced by the themed overlay menu);
  - event `watchlist:updated` broadcast to overlay and settings window.

## Task 4 — Watchlist in the UI

- **Tagging from the table**: right-click a row → native menu built in main
  (`Menu.buildFromTemplate(...).popup({ window })`): "Mark as sniper", "Mark as
  cheater", "Mark as other…", separator, "Edit note in Settings", "Remove from
  watchlist" (only when present), and for an entry from an imported list
  "From list: <label>" (disabled, informative). For a NICKED row add a first
  disabled line "This is a nick: the tag follows the nick, not the player".
  Left click keeps copying the name.
- **Nick links (owner request 2026-11-18)**: a teammate playing nicked shows up
  as a NICKED row. On a NICKED row the menu also offers "This is my teammate"
  with a submenu of the current party members plus "Someone else" (link with
  empty friend). A linked nick is removed from the table and never shown again
  (later detections of that nick are ignored), so it no longer looks like an
  unknown nicked player. Linked nicks are not exported or imported (they are
  personal). Managed in the Watchlist tab (Task 4b): list nick → friend, date,
  remove.
- **Chips** in the Tags column: SNIPER (amber), CHEATER (red), OTHER (neutral),
  built from existing tokens, readable at low opacity like the other chips
  (`--lo`, `--scrim-a`). An imported entry uses an outlined variant and its
  title says "From <list label>: <note>". The row gets a rail like the other
  row states (`table.css`), weaker than nicked.
- **Alert**: when a watchlisted player enters the table, show the existing
  toast ("SNIPER Xx_Name is in your lobby", about 6 s, `role="status"`), once
  per player per lobby (reset on `players_clear`). Setting
  `watchlistSound` (default off) plays a short built-in beep through Web
  Audio (no audio file, no dependency). If the overlay is hidden, call
  `win.flashFrame(true)` so the taskbar button blinks.
- **Sorting**: setting `watchlistOnTop` (default on), same mechanism as
  `nickedOnTop` (`sorting.ts`), placed after the party and before nicked.
- **Settings → new tab "Watchlist"** (`renderer/ts/settings/tabWatchlist.ts`,
  split if it grows): add by name (with kind and note), search, list with kind
  selector, editable note, date added, source, remove; imported lists with
  count and a remove button; buttons Import file, Paste list, Export file, Copy
  as text, with the preview step showing counts before confirming; section
  "Sniper detection" with the login-age settings of Task 2; the two alert
  settings. Add the tab id to `SETTINGS_TAB_IDS`; the context menu's "Edit note
  in Settings" opens this tab.
- Copy everywhere in English, short; imported lists are described as "someone
  else's notes".

Team split (owner request 2026-11-18) was dropped on 2026-11-20: Pika never logs other players' teams, and a premium login is encrypted (checked: the server sends an Encryption Request), so sniffing cannot read the Teams packet; a proxy was ruled out by the owner.

## Task 5 — Docs, ADR, verification

- `docs/adr/0014-local-watchlist.md`: local file, keyed by name (renames and
  nick rotation lose the tag; no UUID because of cracked accounts), imported
  lists as separate layers that never override the owner's entries, no server.
  Index in `docs/adr/README.md`.
- Update `docs/FUNCTIONALITY.md` (Tags column, login age, watchlist, alert),
  `docs/STATE-AND-IPC.md` (channels, events, new state owner),
  `docs/ARCHITECTURE.md` (module map), `docs/API-CLIENT.md` (lastSeen),
  `docs/TESTING.md` (suites, counts), `README.md` (features, settings table).
- Version 5.2.0-beta.1 in `package.json` (owner 2026-11-20: beta until the owner plays and Task 0 + live checks run; then the final 5.2.0) and `package-lock.json` (root entries
  only). Do **not** publish a release without the owner's explicit OK.

## Tests (node:test)

- `validate`/`format`: names, kinds, note cleaning, HTML in notes stays text
  after `esc()`, size and count caps, duplicates, text format with comments and
  bare names, JSON with wrong `format`/`version` rejected with a clear error.
- `store`: own entry beats imported, removing a list removes only its entries,
  re-import with the same label replaces, corrupt file → backup + empty,
  atomic write.
- `profileInfo.lastSeen` validation; `loginAgeView`/`formatAge` boundaries
  (level threshold, fresh threshold, off/all modes, null).
- Config: new keys validated and defaulted; `tags` inserted into old
  `columnOrder`.
- Table: status row with the tags column keeps pills on one left edge; chips
  order.

## Verification to report (honestly, per `AGENTS.md`)

1. `npm run typecheck` clean, `npm test` green with the count.
2. `scripts/smoke.mjs` extended: mark a row as sniper through IPC, chip
   appears; export to a temp file, clear, import it, chip back; remove list.
   Report the pass line. Key only from `PIKA_API_KEY`.
3. Screenshots (`PIKA_SHOTS=1`, add demo rows with lastSeen values and
   watchlist entries): detailed, compact, narrow, both themes; chips aligned;
   Watchlist tab dark and light. Look at them and fix what looks wrong.
4. `scripts/simulate-session.mjs --self-test` and one full pure run still
   clean (the table store changed).
5. Task 0 result written down; if the owner could not run it, say so and ship
   login age disabled by default.

## Constraints for the implementer

- Never print, log, commit or copy the Pika API key; the app reads it from
  `%APPDATA%\pika-overlay\config.json`, scripts from `PIKA_API_KEY`.
- API budget 120 requests/minute; no loops against the API besides the probe.
- Machine quirks: `ELECTRON_RUN_AS_NODE=1` is set globally (unset it to launch
  Electron; `scripts/lib/cdp.mjs` already does); some files are CRLF (match
  short single-line anchors when an edit fails); an installed
  `PikaOverlay.exe` may be running and shares `%APPDATA%\pika-overlay` — do not
  kill it without telling the owner, and restore any real config value a test
  changes.
- Files ≤ ~150 lines, one responsibility; no new npm dependencies; no
  TODO/FIXME; comments only where the logic is not obvious; English code and
  docs.
- One commit per task, message ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push and no
  release without the owner's OK.

## Order and parallelism

Task 0 (owner) can run any time. Task 1 first. Task 3 is independent of
Tasks 1–2 and can run in parallel. Task 2 needs Task 1; Task 4 needs Tasks 1
and 3. Task 5 last.
