# ADR-0014 — Local watchlist (v5.2)

**Status:** Accepted

## Context
The owner wants to mark players (snipers, cheaters, others) and see the mark
the next time the name appears in a lobby, to share such lists with friends,
and to stop a teammate who plays nicked from showing up as an unknown nicked
player (request of 2026-11-18). Pika offers no API for any of this, and the
overlay is an external reader of a log file with no server of its own.

Constraints that shape the design:

- Pika accepts cracked accounts, so a Mojang UUID is not a reliable identity;
  the profile API returns no UUID either. The only stable handle the overlay
  sees is the name.
- The overlay must stay an external app: no proxy, no injector, nothing that
  touches the game connection (owner decision).
- Names and notes can come from a file or from Discord, so they are untrusted
  text.

## Decision
The watchlist is a local file, `watchlist.json` next to `config.json`, keyed by
the lowercase player name.

- **Own entries and imported lists are separate layers.** An own entry has
  `source: 'me'`; an import creates a list (label = file name or "Pasted list
  <date>") whose entries carry the list id. At lookup the own entry always wins;
  otherwise the most recent import. An import never changes or deletes an own
  entry, and a whole list is removed in one action. Importing the same label
  again replaces that list.
- **Nick links** say that a nick seen in the log is a teammate. A linked nick
  is hidden from the table (later detections are ignored). They are session-only:
  kept in memory, never written to `watchlist.json` (a `nickLinks` array in an old
  file is ignored on load and dropped at the next write), never exported or
  imported. One nick per teammate (linking F replaces F's other link). A link to a
  friend ends as soon as a party change leaves F out of the party; a "Someone
  else" link ends when the party goes from non-empty to empty. Reason: a link
  that outlived the party hid an enemy once the friend changed nick or a
  stranger took the old one. Pruning runs in main (`onPartyChange` in
  `watcherBindings.ts` -> `WatchlistStore.pruneNickLinks`).
- **No server.** Sharing is by file (JSON) or pasted text; the receiver
  previews the import and confirms it.
- The file is written through a temp file and renamed; a corrupt file is
  renamed to `watchlist.json.bad-<timestamp>` and the app starts empty.

## Consequences
- A rename or a nick rotation loses the tag, because the key is the name. This
  is accepted: there is no better key (see Context).
- Nothing leaves the PC; the privacy statement of the README stays true.
- A shared list is only as good as its author. The chip title and the row menu
  name the list an entry came from, imported chips are drawn outlined, and the
  own entry can override any of them.
- Imported text is shown only through `esc()` / `textContent` and is limited
  (names `[A-Za-z0-9_]{3,16}`, note 120 characters, 5000 entries, 1 MB).
- Two overlay windows read one store: every change is broadcast as
  `watchlist:updated` to both.

## Alternatives
- **Key by UUID:** rejected, cracked accounts and no UUID in the profile API.
- **Shared online list / server:** rejected, out of scope (no server, nothing to
  moderate or host).
- **Imports merged into the own list:** rejected, a bad list could not be
  undone and would overwrite the owner's notes.
- **Per-lobby team split (who is on my team):** dropped on 2026-11-20. Pika's
  log never contains other players' teams (checked on all 25 local logs and in a
  live session). A premium login is encrypted (the server sends an Encryption
  Request at login, verified 2026-11-20), so passive sniffing cannot read the
  Teams packet. A local proxy was rejected by the owner: the overlay stays an
  external app, with no proxy and no injector.

## Implementation notes
- Main: `src/main/watchlist/` (`store.ts`, `fileLoad.ts`, `validate.ts`,
  `format.ts`, `importPreview.ts`, `resolve.ts`, `alerts.ts`, `alertDelivery.ts`,
  `menuSpec.ts`, `menuSession.ts`, `nickLink.ts`, `notify.ts`, `instance.ts`); IPC in
  `src/main/ipc/watchlistHandlers.ts` and `watchlistMenu.ts`. Types:
  `src/shared/watchlist.ts`, `src/shared/menu.ts`.
- Row menu: main builds the content (`menuSpec.ts`) and returns it as data
  (`watchlist:menu`); the overlay draws it in its own look
  (`renderer/ts/table/rowMenu.ts`, `row-menu.css`), not a native menu. Click
  closures stay in main, keyed by a token that only the latest menu holds;
  `watchlist:menuPick(token, id)` runs one and clears them (ADR-0003: main owns
  state and decisions).
- Renderer: Tags column chips (`table/tagsCell.ts`, `watchView.ts`), row classes
  `row-watch-<kind>` (`css/watchlist.css`), alert toast (`core/watchlist.ts`),
  Settings → Watchlist (`settings/tabWatchlist.ts` and `watch*.ts`).
- Config keys: `watchlistOnTop` (default true), `watchlistSound` (default
  false). Channels and events: `docs/STATE-AND-IPC.md`.
- Login age shares the Tags column and the Watchlist tab but not the store; see
  `docs/API-CLIENT.md` for why it is off by default.

## Validation
- `tests/watchlist-format.test.ts`, `watchlist-store.test.ts`,
  `watchlist-table.test.ts`, `watchlist-actions.test.ts`,
  `watchlist-settings-text.test.ts`.
- `node scripts/smoke.mjs`: sniper chip through IPC, text export/import round
  trip, list removal (the real `watchlist.json` is restored afterwards).
- Not field-verified: the themed row menu, `flashFrame`, beep and the layout in a real
  game session.
