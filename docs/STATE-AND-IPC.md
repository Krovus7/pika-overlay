# STATE-AND-IPC.md

## Shared state (ADR-0003)

`src/main/state/` is the single source of truth. Subsystems (log watcher
bindings, IPC handlers, lookup queue) read/write ONLY these modules — no
direct calls between them.

| Module | State | Consumers |
|---|---|---|
| `playerRegistry.ts` | shown-player keys (lowercased); `add/delete/has/clear/clearExcept/snapshot` | watcher bindings, lookup worker, `players:clear` |
| `partyState.ts` | party member keys; pinned rows | watcher bindings, `players:clear` |
| `gameState.ts` | in-game flag | watcher bindings (tab lock) |
| `lookupQueue.ts` | FIFO jobs, `LOOKUP_CONCURRENCY = 6` | watcher bindings, party sync |

`clearExcept(keep)` returns the removed keys so callers can emit one
`player:remove` per key — no hidden iteration in consumers.

## IPC contract (`src/shared/ipc-contract.ts`)

Channel names are constants shared by main (`ipc/handlers.ts`), preload
(`src/preload.ts`) and renderer (`renderer/ts`). Same channel set as v3 —
nothing removed; update channels added.

Invoke channels: `lookup:player`, `lookup:bulk`, `stats:setInterval`,
`stats:setMode`, `stats:refetchAll`, `players:clear`, `settings:open`,
`settings:close`, `overlay:close`, `overlay:minimize`, `config:get`,
`config:getAll`, `config:set`, `config:save`, `browse:logFile`,
`test:logPath`, `debug:logLines`, `update:getState`, `update:check`,
`update:downloadApply`.

Push events: `player:stats`, `player:loading`, `player:error`,
`player:remove`, `players:clear`, `game:pregame`, `game:start`, `game:end`,
`party:update`, `settings:show`, `config:updated`, `update:state`.

## Watcher event wiring (`main.ts bindWatcherEvents` — bound ONCE)

| Log event | Effect |
|---|---|
| `log_line` | push to the 100-line debug ring |
| `players_sync` | skipped in-game; else `registry.clearExcept(detected)` + removes |
| `pregame_start` | send `game:pregame` overlay event |
| `game_start` / `game_end` / `players_clear` | state flags + cache clear + overlay events; party pinned |
| `player_detected` | skipped in-game if source `tab_list`; else enqueue lookup |
| `player_quit` | party-pinned keys ignored; registry delete + remove event |
| `party_members` / `party_joined` / `party_left` / `party_clear` | party state + overlay rows + auto lookups |

## Lookup flow (`ipc/lookup.ts`)

1. Dedupe via `registry.has`; add key; send `player:loading`.
2. Interval/mode fall back to config (`statsInterval`/`statsMode`).
3. `getPlayerStats` → on in-flight quit (`!registry.has(key)`) discard.
4. Send `player:error` or `player:stats` (+source).

`lookup:bulk` and `stats:refetchAll` are sequential by design (v3); watcher
detections go through the concurrency-bounded queue.

## Config flow

`config:save` (single save path from the settings panel): persist →
watcher restart (nicked-aware username) → always-on-top re-apply → hotkey
re-register → `config:updated` broadcast. `config:set` persists single keys
and broadcasts.
