# ARCHITECTURE.md

Pika Overlay v4 — Electron app that reads the Minecraft `latest.log` of a
Pika-Network BedWars session, extracts player names from chat/scoreboard
events, and shows their BedWars stats (stats.pika-network.net) in a
transparent overlay. v4 is a clean TypeScript rewrite of v3 with identical
overlay graphics and Velopack auto-updates (ADR-0004).

## Process layout

```
src/
├── main/                 Electron main process
│   ├── main.ts           bootstrap + single watcher-event binding point
│   ├── config.ts         typed config store, v3 migration, backup (ADR-0007)
│   ├── windowManager.ts  overlay BrowserWindow (no separate settings window)
│   ├── tray.ts           system tray (version label from package.json)
│   ├── hotkeyManager.ts  global hotkeys with accelerator normalization
│   ├── state/            single source of truth (ADR-0003)
│   │   ├── gameState.ts      in-game flag (tab-list lock)
│   │   ├── partyState.ts     party members (pinned)
│   │   ├── playerRegistry.ts shown-player keys
│   │   └── lookupQueue.ts    FIFO queue, concurrency 6
│   ├── log/              log parsing (1:1 port from v3, ADR/LOG-PARSING)
│   │   ├── patterns.ts       compiled regexes
│   │   ├── nameCleaner.ts    cleanName + common-word blocklist
│   │   ├── partyParser.ts    party events + pending-owner buffer
│   │   ├── lineParser.ts     _parseLine flow (order is contractual)
│   │   └── logWatcher.ts     fs polling every 500 ms
│   ├── api/              Pika stats API client
│   │   ├── fetch.ts          timeout + exponential retry
│   │   ├── apiClient.ts      getPlayerStats (nicked/api-off/error semantics)
│   │   ├── statsExtractor.ts leaderboard → PlayerStats
│   │   ├── rankDisplay.ts    rank tables + getRankDisplay
│   │   └── cache.ts          in-memory TTL 10 min
│   ├── ipc/              contract + handlers
│   │   ├── lookup.ts         lookup worker (dedupe + race guard)
│   │   └── handlers.ts       ipcMain.handle registrations
│   └── update/velopackUpdate.ts  Velopack check/download/apply state machine
├── preload.ts            contextBridge → window.pikaOverlay (typed)
└── shared/               types, ipc-contract, columns, preload-api

renderer/
├── overlay.html          copied from v3 (visual overlay unchanged; settings
│                         panel redesigned)
├── overlay.css           copied from v3 + settings-panel v4 additions
├── ts/                   bundled by esbuild → renderer/bundle/overlay.js
│   ├── overlay.ts        UI state, config apply, table management, render
│   ├── settingsPanel.ts  inline settings (tabs, columns, colors, updates)
│   └── table/            sorting.ts, rowBuilder.ts, dropdown.ts, types.ts

tests/                    node:test suites (ADR-0006)
```

## Data flow

```
latest.log
  → LogWatcher._poll()  [fs.openSync/readSync, 500 ms — not fs.watch]
  → LineParser.parseLine()  [events via emit]
  → main.ts bindWatcherEvents()  [bound ONCE]
      → state modules (playerRegistry, partyState, gameState)
      → LookupQueue → lookup() → getPlayerStats() → cache (TTL 10 min)
  → webContents.send('player:stats', …)
  → overlay.ts → rowBuilder.ts → <table>
```

## Build / release

See `build.mjs` and `docs/RELEASING.md`. Dev runs from `dist/` (tsc) +
`renderer/bundle/` (esbuild); packaged builds are `electron-builder --dir` →
`vpk pack` (Velopack Setup/Portable) → `vpk upload github` (update feed).

## Key invariants (from HANDOVER v2, encoded in tests)

- `_parseLine` order: color-strip → party → member list → not-in-party →
  RE_SKIP → lifecycle (recap BEFORE final kill) → joins → final kill →
  kill feed → bed → team tags → tab list (`src/main/log/lineParser.ts`).
- Final-kill victim = first token (`RE_FIRST_TOKEN`), never `cleanName`.
- Lookup concurrency ≤ 6 (max ~8; Pika rate-limits above ~16 HTTP in-flight).
- `players_sync` blocked in-game; only `player_quit` removes players in-game.
- Party members are pinned: never removed by kill feed or manual clears.
