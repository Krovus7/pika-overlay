# FUNCTIONALITY.md

User-visible behavior of Pika Overlay v5. UI text is English. Everything below
was read from the source (paths in brackets); nothing here is field-verified
unless `docs/VERIFICATION-2026-11.md` says so.

## Player detection (from the log)

| Source | Trigger | Event |
|---|---|---|
| Pre-game join | `BedWars <icon> Name has joined! (n/8)` | `player_detected(name, 'join')`; self-join → `players_clear` + `pregame_start` |
| Pre-game quit | `BedWars <icon> Name has quit! (n/8)` | `player_quit(name)` |
| Final kill | final-kill line | victim → `player_quit` |
| Kill feed | `Name was killed by X`, `Killer killed Victim …` | `player_detected(name, 'kill_feed')` (never removal) |
| Bed break | `Team's Bed has been destroyed by Name`, `BED DESTRUCTION > RED by Name` | `player_detected(name, 'bed_break')` |
| Team tag | `[RED] Name …` | `player_detected(name, 'team_announce')` |
| Tab roster | comma-separated names, ≥ 3 valid and > 60 % of tokens valid | `players_sync` + `player_detected(name, 'tab_list')` |
| Party | party lines and `/p info` | see Party |
| Manual | search box: one name → `lookup:player`, several → `lookup:bulk` | source `manual` / `bulk` |

Parser contract: `docs/LOG-PARSING.md`; patterns: `src/main/log/patterns.ts`.
The search box accepts names of 3–16 characters `[A-Za-z0-9_]`, separated by
spaces, commas or newlines; other tokens are dropped
(`renderer/ts/ui/search.ts`).

## Game lifecycle and removal

`src/main/watcherBindings.ts`:

The table follows the lobby, not the match (ADR-0012):

- `pregame_start` → status pill "In queue".
- `game_start` (Pika: `Goodluck with your BedWars Game`) → status pill
  "In game". The table is **not** changed: the players of the pre-game lobby
  are the players of the match.
- `game_end` → status pill "Idle".
- `players_clear` (own join of a new lobby, match recap, server change) →
  queued non-party lookups dropped, non-party rows removed.
- `player_quit` (pre-game quit, final kill) removes a row unless the player
  is in the party. After the match start it also marks the player as
  eliminated until the lobby changes.
- A tab roster (`players_sync` + `tab_list` detections) works before and
  during a match: rows not in the roster are removed (party members stay),
  missing players are added, and a player eliminated in the current match is
  not added again (eliminated players remain on the server as spectators).
- Lookups that were still waiting for the old lobby are dropped on
  `players_clear`; typed names (`manual`, `bulk`) and party members are kept.

## Row statuses

Every lookup ends in one status (`src/shared/types.ts`, classification table in
`docs/API-CLIENT.md`). Pill text, notes and retry button:
`renderer/ts/table/statusRow.ts`.

| Pill | Status | Meaning | Note shown | Retry button |
|---|---|---|---|---|
| (stats) | `ok` | Profile and BedWars data for the selected period and mode | — | — |
| NICKED | `nicked` | Name unknown to Pika, and it came from the game (not typed) | name not on Pika | no |
| NOT FOUND | `not_found` | Name unknown to Pika, typed by the user (typo or nick) | typo or nicked | no |
| API OFF | `api_off` | Stats are private (leaderboard answered 204) | stats set to private | no |
| NO STATS | `never_played` | Public profile, every BedWars entry empty (a brand-new account, but also an old one whose stats Pika does not publish) | level 5 or lower: new account, no BedWars games; higher or unknown level: no public BedWars stats | no |
| NO GAMES | `no_data` | BedWars data exists, none in the selected period/mode | `no games this week in Solo` style | no |
| ERROR | `error` | Timeout, network, 5xx, invalid body | lookup failed | yes |
| RATE LIMITED | `rate_limited` | 429/503 after retries | retrying automatically | no |
| KEY REQUIRED | `auth` | No key saved or key rejected | add your API key in Settings | no |

- `error` and `rate_limited` rows are retried automatically at most twice
  (after 4 s and 12 s; a rate-limited retry waits for the API's resume time).
  The Retry button, a period/mode change or a key change restart that budget
  (`src/main/ipc/autoRetry.ts`, `lookup.ts`).
- Profile data (level, rank, guild) stays visible on `api_off`, `never_played`
  and `no_data` rows.
- Row markers: diamond icon = party member; red rail + tint = nicked; amber,
  red or grey rail + faint tint = watchlist (weaker than party, nicked and own
  row). Chips (`YOU`, `BOT?`, watchlist, login age) sit in the Tags column, see
  below.
- A source badge (Search, Paste, Tab, Join, Kill, Bed, Team, Party) shows how
  the player was found (`renderer/ts/table/sourceBadge.ts`).
- The footer summarizes the table: player count, plus counts of nicked, API
  off and new (`never_played`) rows when non-zero.

### Tags column

`renderer/ts/table/tagsCell.ts`: small chips, left-aligned in one fixed order
(`YOU`, watchlist, login age, `BOT?`). Status rows keep the cell too, before the
guild cell, so pills still share one left edge. The full list is also the cell's
hover text. The column is on by default, in the compact layout as well; a saved
column order without it gets it right after Player. If the window is too narrow
it is dropped like any other column (rightmost first).

- `YOU` = own row. `BOT?` = `ok` row at level 0 or 1 with zero final kills,
  kills and wins (only when "Highlight suspected bots and alts" is on).
- Watchlist chip: `SNIPER` (amber), `CHEATER` (red), `OTHER` (neutral). An entry
  from an imported list is outlined and its hover text says "From <list>:
  <note>"; an own entry shows its note.
- Login age chip, see "Login age". It re-renders every 30 s, only while the
  Tags column is visible and a row shows an age.

### Watchlist

A local list of names with a kind (sniper, cheater, other) and a note
(ADR-0014); stored in `watchlist.json`, keyed by name.

- **Mark a player:** right-click a row. The native menu has Mark as sniper /
  cheater / other (changing the kind keeps an own note), Edit note in Settings
  (opens Settings → Watchlist), Remove from watchlist (own entry) or a disabled
  "From list: <label>" (imported entry). Left click still copies the name.
- **Nicked teammate:** on a NICKED row the menu starts with a disabled line
  saying the tag follows the nick, not the player, and ends with "This is my
  teammate" (party members, or "Someone else"). The nick is then hidden from the
  table and ignored when detected again. Nick links are personal and never
  exported. They are listed in Settings → Watchlist and can be removed there.
- **Alert:** when a watched player enters the table from the log (not typed
  names, party members or the own row) a toast "SNIPER Name is in your lobby"
  shows for about 6 s, once per player per lobby. Optional beep
  (`watchlistSound`, default off). If the overlay is hidden or minimized the
  taskbar button flashes until it is shown again.
- **Sorting:** watched rows come right after the party (`watchlistOnTop`,
  default on).
- **Share:** export own entries (optionally with imported lists) as a JSON file,
  copy them as text (`name, kind, note` per line), import a `.json`/`.txt` file or
  pasted text. An import shows a preview (count, conflicts, invalid lines, a
  warning when it replaces a list of the same label) and saves only on confirm.
  Imported entries form a list of their own: they never override an own entry
  and the whole list can be removed in one click. Limits: names 3-16
  `[A-Za-z0-9_]`, notes 120 characters, 5000 entries and 1 MB per file.
- A rename or a nick change loses the tag (the name is the key).

### Login age

An optional chip with the time since the profile's `lastSeen` (`FRESH 3m` when
it is at most `freshMinutes` old, otherwise `7m`, `3h`, `2d`). It costs no extra
request: the profile is already fetched. **Off by default**, because what
`lastSeen` means (last login or last logout) is not verified yet; see
`docs/API-CLIENT.md`. Settings → Watchlist → Sniper detection: off, low level only
(`loginAgeMaxLevel`, default 10) or all players, and `freshMinutes` (default
5). The chip's hover text reads "Last seen on Pika <time> ago (Pika profile)".

### Sort order

`renderer/ts/table/sorting.ts`: own row first (if "Pin my row" is on) → party
members → watched (if "Show marked players first" is on) → nicked (if "Show nicked players first" is on) → `ok` rows by the
selected column → rows without stats (`not_found`, `api_off`, `never_played`,
`no_data`) → `error` / `rate_limited` / `auth` → rows still loading. Click a
sortable header to sort; a second click flips the direction. Default: FKDR
descending. Ties sort by name.

## API health banner

Shown between the search bar and the table whenever health is not `ok`
(`renderer/ts/ui/banner.ts`; health logic in `src/main/api/health.ts`).

| Health | Banner |
|---|---|
| `ok` | hidden |
| `key_missing` | "Pika API key required. Run /apikey in-game, then paste it in Settings." + Open Settings |
| `key_invalid` | "API key rejected. Check it in-game with /apikey." + Open Settings |
| `rate_limited` | "Rate limit reached — resuming in Ns" (counts down) |
| `unreachable` | "Pika API unreachable — retrying" |

While the key is missing or rejected no request is sent. With an empty table
the empty state names the same blockers (`renderer/ts/ui/emptyState.ts`);
otherwise it reads "Waiting for players".

## Stats

- 15 columns (`src/shared/columns.ts`): rank (LV), player, tags, guild, FKDR,
  finals, KD, WLR, wins, beds, winstreak, kills, deaths, bow kills, source.
  Default visible: all except guild, kills, deaths, bow kills
  (`src/main/config.ts`). Player is always visible. Numbers of 10 000 and up
  are shortened (`21.4k`).
- Periods: All Time, Weekly, Monthly, Yearly. Modes: Overall, Solo, Duo,
  Triples, Quad. Changing either re-fetches every shown row with its original
  source (`stats:refetchAll`); with an empty table it is only saved.
- FKDR, KD and WLR are colored by tier (hacker, godlike, good, medium, bad)
  from the thresholds and colors in Settings → Colors.

## Party

`src/main/log/partyParser.ts`, `src/main/watcherBindings.ts`:

- `Party … X joined the party` → member added and looked up (source `party`).
- `Party … X left / has left / was kicked / has been kicked` → member and row
  removed.
- Party disbanded, "you left the party", "you are no longer in a party",
  `/p info` answering "not in a party" → party cleared, party rows removed.
- `/p info` owner + members (several line formats, see LOG-PARSING.md) → party
  replaced by that list; members no longer listed lose their row; every
  member is looked up.
- Party lookups run before the backlog of other detections
  (`state/lookupQueue.ts`).
- Party members and the user's own row are fetched fresh (cache skipped) on
  party events and at every new lobby; everyone else comes from the cache for
  10 minutes (`docs/API-CLIENT.md`). The title-bar refresh button empties the
  cache and reloads every shown row.
- Party members survive `game_start`, `players_clear` and the clear button,
  and are not removed by `player_quit`.

## Nick handling

- A name that Pika does not know and that was seen in the game becomes
  NICKED; the same answer for a typed name is NOT FOUND (ADR-0010).
- "I am nicked" + "My nick" (Settings → General): the watcher looks for the
  nick in the log (that is what chat shows) and the overlay shows your real
  username on that row (`ipc/configHandlers.ts`, `table/rowBuilder.ts`).

## Layouts, density, scale

- **Detailed:** all enabled columns in the saved order. **Compact:** only the
  columns ticked in Settings → Columns → Compact layout (player always).
  Toggle: title-bar layout button or Settings → Appearance.
- **Row density:** comfortable (row height 34 px), dense (28 px); compact
  layout rows are 26 px (`renderer/css/tokens.css`).
- **Interface scale:** 80–150 %, applied as the window zoom factor and the
  overlay window is resized by the same ratio (top-left fixed, clamped to the
  screen's work area; minimum size 360 × 200 at 100 %, scaled too). Saved when
  the slider is released (`windowManager.ts`, `windowBounds.ts`).
- **Narrow window:** the table never scrolls sideways. Columns that do not
  fit are hidden, rightmost first, never Player; the footer says "N columns
  hidden" (`renderer/ts/table/fit.ts`).
- **Copy a name:** click a player name; it is copied and a short "Copied …"
  message shows.
- **Pills line up:** every status row keeps its Level and Guild cells (a dash
  when unknown), so all status pills start at the same left edge.

## Themes and low opacity

Settings → Appearance → Theme, or the title-bar sun/moon button. Dark =
navy panels with light text (dark scenes), light = light panels with dark text
(bright scenes). Opacity affects the background only, never text
(5–100 %, default 92 %). As opacity drops below 75 % the overlay adds
per-row backing, detaches rows into strips and adds a text halo, reaching its
maximum at 5 %. Mechanism and thresholds: ADR-0011.
A legacy v4 `localStorage` light-mode choice (`loMode`) is migrated once into
the `theme` setting (`renderer/ts/ui/theme.ts`).

## Settings window

Opened by the title-bar button, the tray "Settings" item, or the banner /
empty-state button (these two open the API tab). It is a separate window next
to the overlay (ADR-0013), so every change is visible on the overlay at once;
opening it again focuses it. When the overlay is always on top, so is this
window. Every control saves itself (text after a 400 ms pause, or on blur /
Enter / close; the background-opacity slider and the color pickers about every
120 ms while dragging; other sliders on release); a "Saved" indicator confirms.
The one explicit button is **Save key** in the API tab
(`renderer/ts/settings/saveQueue.ts`). Escape or the X closes the window; its
position and size are remembered (`settingsBounds`).

| Tab | Settings |
|---|---|
| General | Minecraft log file (path, Browse, found / not found check); My username; Pin my row to the top (`pinSelf`); I am nicked (`isNicked`) + My nick (`myNickName`); hotkeys Show/hide (`toggleHotkey`, default F4) and Clear (`clearHotkey`, default F5) — the two may not be equal |
| API | live connection status; steps to get a key; key field (hidden by default, eye button), **Test**, **Save key**; legend of the row labels |
| Appearance | Theme; Background opacity (`opacity`); Interface scale (`uiScale`, reset button); Always on top (`alwaysOnTop`); Layout (`overlayMode`); Row density (`rowDensity`); Show nicked players first (`nickedOnTop`); Highlight suspected bots and alts (`highlightSuspects`); "Preview with sample players" demo rows |
| Columns | Detailed layout: show/hide, drag or arrows to reorder (`columnOrder`, `columnEnabled`); Compact layout: column chips (`compactColumns`) |
| Colors | Tier colors (`ratioColors`, Reset colors); thresholds per ratio FKDR/KD/WLR (`ratioThresholds`, validated: each tier higher than the next, otherwise "Not saved yet"; Reset thresholds) |
| Watchlist | own entries (add by name with kind and note, search, change kind, edit note, remove); imported lists ("someone else's notes", remove); Import file / Paste list / Export file (with "include imported lists") / Copy as text, each import with a preview step; nick links (nick, teammate, date, remove); Sniper detection (login age: `loginAge`, `loginAgeMaxLevel`, `freshMinutes`, marked experimental); Alerts (`watchlistSound` "Play a beep", `watchlistOnTop` "Show marked players first") |
| Updates | installed version; Check for updates; Update and restart; Check on startup (`updateAutoCheck`) |
| Debug | app version, API connection state, log file found; last 60 of the 100 most recent log lines (a Pika API key in a line — `/apikey` answers in chat — is replaced by `pika_<hidden>`, `src/main/log/redact.ts`), Refresh, Copy |

Defaults, ranges and validation of every key: `src/main/config.ts`
(`opacity` clamped to 0.05–1, `uiScale` to 0.8–1.5, enums fall back to the
default, `apiKey` is trimmed).

## Window, taskbar and tray

`src/main/windowManager.ts`, `src/main/tray.ts`, `src/main/ipc/handlers.ts`:
the overlay is a normal frameless window, so it has a taskbar button while it
is shown. The title-bar **X** hides the window (`overlay:close`): the taskbar
button goes away and the app stays in the tray, from where it can be shown
again or quit. The minimize button minimizes to the taskbar.

## Hotkeys

Global shortcuts registered by `src/main/hotkeyManager.ts` (re-registered on
every config save). Show/hide toggles the overlay window and re-applies
always-on-top. Clear does exactly what the title-bar clear button does
(`src/main/ipc/clearPlayers.ts`): party members stay, every other row goes,
lookups still queued for removed players are dropped and the stats cache is
emptied. An accelerator that is already
taken is logged and not registered.

## Auto-update

Silent check at startup (opt-out `updateAutoCheck`), explicit download and
apply from Settings → Updates, feed = GitHub Releases of
`Krovus7/pika-overlay`, delta support (`src/main/update/velopackUpdate.ts`).
Disabled in dev mode (not packaged); the Updates tab then shows a message.
