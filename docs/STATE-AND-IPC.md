# STATE-AND-IPC.md

## Shared state (ADR-0003)

`src/main/state/` holds the main-process state. The log-watcher bindings, the
IPC handlers and the lookup service read and write these modules instead of
calling each other.

| Module | State | Main consumers |
|---|---|---|
| `playerRegistry.ts` | shown players, key = lowercased name → `{ name, source }`; `add/get/has/delete/entries/clearExcept/clear/snapshot` | watcher bindings, `LookupService`, `players:clear`, key-change refresh |
| `partyState.ts` | party member keys (pinned rows) | watcher bindings, `players:clear`, queue drop filter |
| `gameState.ts` | match running flag + players eliminated in the current match | watcher bindings |
| `lookupQueue.ts` | pending jobs; `LOOKUP_CONCURRENCY = 6`; `party` and `manual` jobs go ahead of the backlog (FIFO within each class); a job with a free slot starts inside `enqueue`, so the player is registered before the next log event is handled; `dropPending(predicate)` | watcher bindings, `lookup:bulk`, `refreshAll` |

`registry.add(name, source)` keeps an existing entry unchanged, so a row keeps
the source it was first found with; `refresh` re-runs a registered player with
that name and source. `clearExcept(keep)` and `clear()` return the removed keys
so callers can emit one `player:remove` per key.

Outside `state/`:

| Owner | State |
|---|---|
| `src/main/config.ts` `ConfigStore` | persisted config (`config.json`) |
| `src/main/api/apiSession.ts` | the API key in use; a different key resets health, cache and rate budget |
| `src/main/api/health.ts` | `ApiHealth` (key status, rate-limit pause, reachability) |
| `src/main/api/cache.ts` | profile and stats caches (TTLs in `docs/API-CLIENT.md`) |
| `src/main/api/rateLimiter.ts` | request budget of the current window |
| `src/main/ipc/autoRetry.ts` | per-player automatic retry counters and timers |
| `renderer/ts/core/state.ts` | overlay-side mirror: shown rows, sort, party, layout, health |

## IPC contract (`src/shared/ipc-contract.ts`)

Channel names are constants shared by main (`src/main/ipc/`), preload
(`src/preload.ts`) and renderer. The typed renderer API is `PikaOverlayApi` in
`src/shared/preload-api.ts` (exposed as `window.pikaOverlay`).

### Invoke channels (`IPC_CHANNELS`)

| Channel | Preload method | Handler |
|---|---|---|
| `lookup:player` | `lookupPlayer(name, interval, mode)` | `handlers.ts` → `LookupService.lookup(…, 'manual')` |
| `lookup:bulk` | `lookupBulk(names, interval, mode)` | `handlers.ts` → queue, source `bulk`; returns the count |
| `lookup:retry` | `retryPlayer(name)` | `handlers.ts` → `LookupService.retry` |
| `stats:setInterval` | `setStatsInterval(interval)` | `handlers.ts` (persist + `config:updated`) |
| `stats:setMode` | `setStatsMode(mode)` | `handlers.ts` (persist + `config:updated`) |
| `stats:refetchAll` | `refetchAll(interval, mode)` | `handlers.ts` → `LookupService.refreshAll` |
| `players:clear` | `clearPlayers()` | `handlers.ts` → `clearPlayers.ts` (keeps party, drops queued lookups of removed players, clears cache) |
| `players:refresh` | `refreshPlayers()` | `handlers.ts` (clears the cache, `LookupService.refreshAll`) |
| `settings:open` | `openSettings(tab?)` | `handlers.ts` → `settingsWindow.openSettings` (tab validated against `SETTINGS_TAB_IDS`) |
| `settings:close` / `settings:minimize` | `closeSettings()` / `minimizeSettings()` | `handlers.ts` (settings window) |
| `overlay:demo` | `setDemo(on)` | `handlers.ts` relays to the overlay as the `overlay:demo` event (Appearance preview) |
| `clipboard:copy` | `copyText(text)` | `handlers.ts` (`clipboard.writeText`; a string of 1–32 characters only) |
| `overlay:close` / `overlay:minimize` | `closeOverlay()` / `minimizeOverlay()` | `handlers.ts` (hide / minimize) |
| `config:get` / `config:getAll` | `getConfig(key)` / `getAllConfig()` | `configHandlers.ts` |
| `config:set` | `setConfig(key, value)` | `configHandlers.ts` |
| `config:save` | `saveConfig(cfg)` | `configHandlers.ts` |
| `browse:logFile` / `test:logPath` | `browseLogFile()` / `testLogPath(path)` | `handlers.ts` |
| `debug:logLines` | `getLogLines()` | `handlers.ts` (ring of the last 100 lines, API key redacted) |
| `update:getState` / `update:check` / `update:downloadApply` | `getUpdateState()` / `checkForUpdates()` / `downloadAndApply()` | `handlers.ts` → `velopackUpdate.ts` |
| `api:getHealth` | `getApiHealth()` | `apiHandlers.ts` |
| `api:testKey` | `testApiKey(key)` | `apiHandlers.ts` → `keyTest.ts` (no save, no health change) |
| `watchlist:get` / `set` / `removeList` | `getWatchlist()` / `setWatchEntry(name, change \| null)` / `removeWatchList(id)` | `watchlistHandlers.ts` → `watchlist/store.ts` (`watchlist.json`; set/remove broadcast `watchlist:updated`) |
| `watchlist:export` / `copyText` | `exportWatchlist({ includeImported })` / `copyWatchlistText()` | `watchlistHandlers.ts` (save dialog, clipboard; own entries unless imported ones are ticked) |
| `watchlist:importFile` / `importText` / `confirmImport` | `importWatchlistFile()` / `importWatchlistText(text, kind)` / `confirmWatchImport(token)` | `watchlistHandlers.ts` → `importPreview.ts` (preview in memory for 5 minutes, saved on confirm) |
| `watchlist:menu` | `showWatchMenu(name, nicked)` | `watchlistMenu.ts` + `menuSpec.ts`: native row menu (marks, remove, imported source line, nick link submenu with the party) |
| `watchlist:linkNick` / `unlinkNick` | `linkNick(nick, friend \| null)` / `unlinkNick(nick)` | `watchlistHandlers.ts` (nick links: personal, never exported or imported) |

### Push events (`IPC_EVENTS`, main → renderer)

| Event | Preload subscriber | Payload |
|---|---|---|
| `player:loading` | `onPlayerLoading` | `{ username, source }` |
| `player:stats` | `onPlayerStats` | `StatsPayload` = `PlayerResult & { source }` — one event per lookup outcome, `status` says which |
| `player:remove` | `onPlayerRemove` | lowercased username |
| `players:clear` | `onPlayersClear` | — |
| `game:pregame` / `game:start` / `game:end` | `onGamePregame` / `onGameStart` / `onGameEnd` | — |
| `party:update` | `onPartyUpdate` | `string[]` (lowercased members) |
| `settings:tab` | `onSettingsTab` | tab id (settings window only) |
| `overlay:demo` | `onDemo` | `boolean` (overlay only) |
| `config:updated` | `onConfigUpdate` | full config object (overlay + settings window) |
| `update:state` | `onUpdateState` | `UpdateState` (overlay + settings window) |
| `api:health` | `onApiHealth` | `ApiHealth` (overlay + settings window) |
| `watchlist:updated` | `onWatchlistUpdate` | `WatchlistView` = `{ entries, lists, nickLinks, resolved }`; `resolved` maps lowercase name to `{ kind, note, sourceLabel, imported }` with own-beats-imported already applied (overlay + settings window) |
| `watchlist:alert` | `onWatchlistAlert` | `WatchAlert` `{ name, kind, note }`, overlay only: a watched player entered the table, once per player per lobby (`WatchAlerts`, reset on `players_clear`); main also calls `flashFrame` when the overlay is hidden |

`player:error` no longer exists (removed in v5, ADR-0010). The preload keeps
one listener per event (`removeAllListeners` before `on`). `config:updated`,
`api:health` and `update:state` are sent with `broadcast()` (`src/main/broadcast.ts`)
to the overlay and, when open, the settings window; every other event goes to the
overlay only.

Types: `PlayerResult`, `PlayerStatus`, `ApiHealth`, `ApiKeyTestResult`,
`UpdateState` are in `src/shared/types.ts`.

## Watcher event wiring (`watcherBindings.ts`, bound once from `main.ts`)

| Log event | Effect |
|---|---|
| `log_line` | push to the 100-line debug ring |
| `players_sync` | remove registry rows that are neither in the roster nor party members, one `player:remove` each |
| `pregame_start` | `game:pregame` |
| `game_start` | match started, eliminated list emptied; `game:start` (rows untouched) |
| `game_end` | in-game flag off; `game:end` |
| `players_clear` | game state reset; drop pending non-party lookups; remove non-party rows; `players:clear` |
| `player_detected` | a `tab_list` detection of a player eliminated in this match is ignored; the user's own pre-game join enqueues a fresh refresh of the party rows and of the own row (once per 20 s); else enqueue (source kept) |
| `player_quit` | marks the player eliminated (once a match started); party members keep their row; else drop their queued lookup, registry delete + `player:remove` |
| `party_members` | remove rows of members no longer listed; replace party; `party:update`; enqueue each member fresh (source `party`; a row already shown takes the `party` source) |
| `party_joined` | add to party; `party:update`; enqueue fresh (source `party`; a row already shown takes the `party` source) |
| `party_left` | delete from party, remove row; `party:update` |
| `party_clear` | remove all party rows; clear party; `party:update` with `[]` |

The stats cache is not cleared on `game_start` / `players_clear`. The
overlay reacts to `game:start` with the status pill only.
"Drop pending" removes queued jobs that are not refreshes, not typed
(`manual`, `bulk`) and not for a party member.

## Lookup flow (`ipc/lookup.ts`)

1. `lookup`: `registry.add(name, source)`; a name already registered is
   ignored. `refresh` skips this and reuses the registered name and source.
2. Send `player:loading`.
3. `getPlayerStats(name, interval, mode)` with the config's `statsInterval` /
   `statsMode` as fallback.
4. Discard the result when a newer run for the same player started or the
   player left the registry meanwhile.
5. `applySource`: `not_found` from a non-typed source becomes `nicked`.
6. Send one `player:stats` with the source; report the status to `AutoRetry`.

`lookup:bulk` and watcher detections go through the queue; `lookup:player`
runs directly. `stats:refetchAll` and an API-key change queue a refresh of
every registered player (`refresh: true`, sources preserved).

## Config flow (`ipc/configHandlers.ts`)

`config:save` and `config:set` share one path: apply the change; when `apiKey`
changed, `setApiKey` (resets health, cache, budget) and refresh every row;
re-apply always-on-top and zoom (of both windows); when `uiScale` changed, resize the
overlay by new/old first (`windowManager.resizeForScale`, saves `overlayBounds`);
broadcast `config:updated`. `config:save`
additionally restarts the log watcher only when the log path or the watched
name changed (the nick when "I am nicked" is on, else the username) and
re-registers the hotkeys. The settings window writes through `config:save`
(`settings/saveQueue.ts`); the overlay itself uses `config:set` for `theme` and
`overlayMode`.
