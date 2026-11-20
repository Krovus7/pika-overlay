# ARCHITECTURE.md

Pika Overlay v5 — Electron app that reads the Minecraft `latest.log` of a
Pika-Network BedWars session, extracts player names from chat/scoreboard
events, and shows their BedWars stats (stats.pika-network.net) in a
transparent overlay. v5 adds the API key and the status model (ADR-0010), a
rewritten renderer with dark/light themes (ADR-0011) and a rate-budgeted
lookup pipeline. Installer and auto-update: Velopack (ADR-0004).

## Module map

```
src/
├── preload.ts            contextBridge → window.pikaOverlay (contract: shared/preload-api.ts)
├── shared/               contract shared by main, preload and renderer
│   ├── types.ts          PlayerResult/PlayerStatus, ApiHealth, UpdateState, LookupSource
│   ├── ipc-contract.ts   IPC_CHANNELS, IPC_EVENTS, SETTINGS_TAB_IDS, StatsPayload
│   ├── preload-api.ts    PikaOverlayApi (typed window.pikaOverlay)
│   ├── columns.ts        COLUMN_DEFS (ids, labels, sort keys), mergeColumnOrder
│   └── watchlist.ts      watchlist types: WatchEntry, WatchlistView, WatchResolved, ImportPreview
└── main/                 Electron main process
    ├── main.ts           bootstrap, wiring; creates LookupService + LookupQueue
    ├── watcherBindings.ts  log-watcher event → state/queue/overlay (bound once)
    ├── config.ts         typed config store, defaults, validation, v3 migration, .bak (ADR-0007)
    ├── windowManager.ts  overlay BrowserWindow, always-on-top, zoom + resize on uiScale change
    ├── settingsWindow.ts settings BrowserWindow (ADR-0013): one instance, placement, level
    ├── windowBounds.ts   pure geometry: scaleBounds, placeBeside, isInsideAny
    ├── broadcast.ts      send config/health/update events to overlay + settings window
    ├── tray.ts           system tray
    ├── hotkeyManager.ts  global hotkeys, accelerator normalization
    ├── devShots.ts, devShotsSettings.ts   PIKA_SHOTS=1 screenshot driver (dev only)
    ├── replay.ts         PIKA_REPLAY=<log> replay driver (dev only)
    ├── state/            single source of truth (ADR-0003)
    │   ├── gameState.ts      match running + players eliminated in it
    │   ├── partyState.ts     party members (pinned)
    │   ├── playerRegistry.ts shown players: key → {name, source}
    │   ├── lookupQueue.ts    bounded queue (concurrency 6), priority, dropPending
    │   └── index.ts          singletons + class exports
    ├── watchlist/        local watchlist (ADR-0014)
    │   ├── store.ts          WatchlistStore: own entries, imported lists, nick links; save-then-commit
    │   ├── fileLoad.ts       load/repair/atomic save of watchlist.json, corrupt file → .bad-<ts>
    │   ├── validate.ts, format.ts   pure: names, notes, caps; JSON and text export/import
    │   ├── importPreview.ts  pending previews (5 min, single use)
    │   ├── resolve.ts        own entry beats imported; resolved view for the table
    │   ├── alerts.ts, alertDelivery.ts   once per player per lobby; toast event, taskbar flash
    │   ├── menuSpec.ts       row context menu as data (testable)
    │   ├── menuSession.ts    menu view for the overlay + latest-token click map
    │   ├── nickLink.ts, notify.ts, instance.ts
    ├── log/              log parsing (ported from v3; see LOG-PARSING.md)
    │   ├── patterns.ts, nameCleaner.ts, partyParser.ts, lineParser.ts
    │   └── logWatcher.ts     fs polling every 500 ms
    ├── api/              Pika stats API client (see API-CLIENT.md)
    │   ├── apiClient.ts      getPlayerStats: profile + leaderboard → PlayerResult
    │   ├── apiSession.ts     current key; a new key resets health, cache, budget
    │   ├── fetch.ts          X-Api-Key, rate gate, timeout, retry
    │   ├── rateLimiter.ts    header-driven request budget (clock-injectable)
    │   ├── outcome.ts        HTTP exchange → Outcome
    │   ├── decision.ts       Outcome(s) → PlayerResult (pure decision table)
    │   ├── statsExtractor.ts leaderboard → BedwarsNumbers
    │   ├── rankDisplay.ts    rank tables + getRankDisplay
    │   ├── cache.ts          profile and stats caches, in-flight sharing
    │   ├── health.ts         ApiHealth tracker (key / pause / unreachable)
    │   └── keyTest.ts        validates a key without saving it
    ├── ipc/
    │   ├── handlers.ts       core ipcMain.handle registrations + debug log ring
    │   ├── clearPlayers.ts   manual clear shared by the button and the hotkey
    │   ├── configHandlers.ts config:* and the side effects of a config change
    │   ├── apiHandlers.ts    api:getHealth, api:testKey, api:health push
    │   ├── watchlistHandlers.ts, watchlistMenu.ts   watchlist:* IPC and the row menu data/pick
    │   ├── lookup.ts         LookupService: lookup/refresh/retry/refreshAll, race guards
    │   └── autoRetry.ts      automatic retry of error / rate_limited rows
    └── update/velopackUpdate.ts  Velopack check/download/apply state machine

renderer/
├── overlay.html          overlay markup + SVG icon sprite
├── settings.html         settings window markup (own copy of the sprite)
├── css/                  tokens.css (theme contract), base, titlebar, search, banner,
│                         table, row-states, compact, footer, settings-*.css
├── fonts/                bundled Inter variable font + OFL license
├── bundle/               overlay.js, settings.js: esbuild output (gitignored)
└── ts/                   entries: overlay.ts (IPC wiring), settingsWindow.ts (settings window)
    ├── core/             state.ts (single mutable state), config.ts, players.ts
    ├── table/            header, sorting, rowBuilder, rowView (pure row view + signature), statusRow,
    │                     cells, tagsCell (chips), loginAge + ageTimer, watchView, render,
    │                     reconcile (keyed DOM), dropdown, format, sourceBadge, actions, types,
    │                     fit (columns that fit the window width)
    ├── ui/               appearance, banner, emptyState, footer, gameStatus, icons,
    │                     lowOpacity, search, theme, toast
    ├── settings/         index (shell: tabs, save indicator), saveQueue, store, controls, hotkeyField,
    │                     tabGeneral/Api/Appearance/Columns/Colors/Watchlist/Updates/Debug,
    │                     watchEntries/Lists/Transfer/NickLinks/Sniper/Action/Text (Watchlist tab),
    │                     apiHealthView, statusLegend
    └── demo/             window.__pikaDemo* helpers (demo rows, backdrops)

scripts/                  smoke, live-api-check, replay-logs, make-icon, update-check,
                          update-cycle; reference/v3-logWatcher.js (frozen parser)
tests/                    node:test suites (ADR-0006), see TESTING.md
assets/                   icon.svg, icon-small.svg, icon.png, icon.ico
```

## Data flow

```
latest.log
  → LogWatcher poll (500 ms)             [log/logWatcher.ts]
  → LineParser.parseLine → events        [log/lineParser.ts, partyParser.ts]
  → bindWatcherEvents (bound once)       [watcherBindings.ts]
      → state modules (registry, party, game)
      → LookupQueue (party/manual first) → LookupService.lookup/refresh
          → getPlayerStats → rate gate → cache → API
          → applySource (404 from a game source → nicked)
  → player:loading / player:stats        [one stats event per outcome]
  → renderer core/players.ts → table/render.ts (sorted, keyed reconcile)

api:health (key, rate pause, reachability) → ui/banner.ts, empty state, Settings → API
config:updated (broadcast to both windows) → overlay: core/config.ts, ui/appearance.ts
                                              (theme, density, opacity, layout); settings: store.ts → tabs
```

## Build / release

`build.mjs`: `build` (default: renderer bundle + preload bundle + `tsc`),
`renderer` (renderer bundle only), `pack`, `release`. Dev runs from `dist/`
(tsc) and `renderer/bundle/` (esbuild). See `docs/RELEASING.md`.

## Key invariants

- Parser order is contractual (`src/main/log/lineParser.ts`, `docs/LOG-PARSING.md`);
  `tests/log-parser.test.ts` certifies it.
- Final-kill victim = first token (`RE_FIRST_TOKEN`), never `cleanName`.
- Lookup concurrency is 6 (`LOOKUP_CONCURRENCY` in `state/lookupQueue.ts`); the
  API budget is 120 requests/minute and is enforced by `api/rateLimiter.ts`.
- The table follows the lobby (ADR-0012): `players_clear` empties it,
  `game_start` does not. A tab roster applies before and during a match and
  never re-adds a player eliminated in it (`watcherBindings.ts`,
  `state/gameState.ts`).
- Party members are pinned: `player_quit` ignores them, lobby change and the
  clear button and the clear hotkey keep them (`watcherBindings.ts`,
  `ipc/clearPlayers.ts`). The overlay removes exactly the rows main tells it
  to (`renderer/ts/core/players.ts`).
- Log lines kept for the Debug tab pass through `log/redact.ts` (API key hidden).
- A 401 flags the key as invalid only when the request was sent with the key
  still in use (`api/fetch.ts`); a passing key test re-arms it (`api/apiSession.ts`).
- The config file is written to a temp file and renamed (`config.ts`).
- Watcher events are bound once, never on config save.
- The watchlist file is keyed by lowercase name; the own entry always beats an
  imported one, and a change reaches memory only after it was saved
  (`watchlist/store.ts`, ADR-0014). Imported text is rendered through `esc()` or
  `textContent` only.
- Every lookup outcome is one `player:stats` event carrying `status`; there is
  no separate error event (ADR-0010).
- Stylesheets use the semantic tokens of `renderer/css/tokens.css`, never
  hard-coded white/black/navy (ADR-0011).
