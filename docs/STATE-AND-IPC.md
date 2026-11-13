# STATE-AND-IPC.md

## Shared state (ADR-0003)

`src/main/state/` holds the main-process state. The log-watcher bindings, the
IPC handlers and the lookup service read and write these modules instead of
calling each other.

| Module | State | Main consumers |
|---|---|---|
| `playerRegistry.ts` | shown players, key = lowercased name → `{ name, source }`; `add/get/has/delete/entries/clearExcept/clear/snapshot` | watcher bindings, `LookupService`, `players:clear`, key-change refresh |
| `partyState.ts` | party member keys (pinned rows) | watcher bindings, `players:clear`, queue drop filter |
| `gameState.ts` | in-game flag (tab-list lock) | watcher bindings |
| `lookupQueue.ts` | pending jobs; `LOOKUP_CONCURRENCY = 6`; `party` and `manual` jobs go ahead of the backlog (FIFO within each class); `dropPending(predicate)` | watcher bindings, `lookup:bulk`, `refreshAll` |

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
| `settings:open` / `settings:close` | `openSettings()` / `closeSettings()` | `handlers.ts` (open sends `settings:show`; close is handled in the overlay) |
| `overlay:close` / `overlay:minimize` | `closeOverlay()` / `minimizeOverlay()` | `handlers.ts` (hide / minimize) |
| `config:get` / `config:getAll` | `getConfig(key)` / `getAllConfig()` | `configHandlers.ts` |
| `config:set` | `setConfig(key, value)` | `configHandlers.ts` |
| `config:save` | `saveConfig(cfg)` | `configHandlers.ts` |
| `browse:logFile` / `test:logPath` | `browseLogFile()` / `testLogPath(path)` | `handlers.ts` |
| `debug:logLines` | `getLogLines()` | `handlers.ts` (ring of the last 100 lines, API key redacted) |
| `update:getState` / `update:check` / `update:downloadApply` | `getUpdateState()` / `checkForUpdates()` / `downloadAndApply()` | `handlers.ts` → `velopackUpdate.ts` |
| `api:getHealth` | `getApiHealth()` | `apiHandlers.ts` |
| `api:testKey` | `testApiKey(key)` | `apiHandlers.ts` → `keyTest.ts` (no save, no health change) |

### Push events (`IPC_EVENTS`, main → renderer)

| Event | Preload subscriber | Payload |
|---|---|---|
| `player:loading` | `onPlayerLoading` | `{ username, source }` |
| `player:stats` | `onPlayerStats` | `StatsPayload` = `PlayerResult & { source }` — one event per lookup outcome, `status` says which |
| `player:remove` | `onPlayerRemove` | lowercased username |
| `players:clear` | `onPlayersClear` | — |
| `game:pregame` / `game:start` / `game:end` | `onGamePregame` / `onGameStart` / `onGameEnd` | — |
| `party:update` | `onPartyUpdate` | `string[]` (lowercased members) |
| `settings:show` | `onSettingsShow` | — |
| `config:updated` | `onConfigUpdate` | full config object |
| `update:state` | `onUpdateState` | `UpdateState` |
| `api:health` | `onApiHealth` | `ApiHealth` |

`player:error` no longer exists (removed in v5, ADR-0010). The preload keeps
one listener per event (`removeAllListeners` before `on`).

Types: `PlayerResult`, `PlayerStatus`, `ApiHealth`, `ApiKeyTestResult`,
`UpdateState` are in `src/shared/types.ts`.

## Watcher event wiring (`watcherBindings.ts`, bound once from `main.ts`)

| Log event | Effect |
|---|---|
| `log_line` | push to the 100-line debug ring |
| `players_sync` | ignored in game; else remove registry rows not in the roster, one `player:remove` each |
| `pregame_start` | `game:pregame` |
| `game_start` | in-game flag on; drop pending non-party lookups; remove non-party rows; `game:start` |
| `game_end` | in-game flag off; `game:end` |
| `players_clear` | in-game flag off; drop pending non-party lookups; remove non-party rows; `players:clear` |
| `player_detected` | ignored in game when the source is `tab_list`; else enqueue (source kept) |
| `player_quit` | ignored for party members; else registry delete + `player:remove` |
| `party_members` | remove rows of members no longer listed; replace party; `party:update`; enqueue each member (source `party`) |
| `party_joined` | add to party; `party:update`; enqueue (source `party`) |
| `party_left` | delete from party, remove row; `party:update` |
| `party_clear` | remove all party rows; clear party; `party:update` with `[]` |

The stats cache is not cleared on `game_start` / `players_clear`.
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
re-apply always-on-top and zoom; broadcast `config:updated`. `config:save`
additionally restarts the log watcher only when the log path or the watched
name changed (the nick when "I am nicked" is on, else the username) and
re-registers the hotkeys. The Settings panel writes through `config:save`
(`settings/saveQueue.ts`); the overlay itself uses `config:set` for `theme` and
`overlayMode`.
