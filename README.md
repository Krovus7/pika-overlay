# Pika Overlay

Electron overlay with BedWars player stats for [Pika-Network](https://www.pika-network.net) (v4, TypeScript).

Reads the Minecraft `latest.log`, detects players from pre-game joins, kill
feed, bed breaks, team tags and tab-list rosters, and shows their BedWars
stats (`stats.pika-network.net`) in a transparent always-on-top overlay.

- **Developer:** AcquaPanna
- **Docs:** `docs/` — ARCHITECTURE, FUNCTIONALITY, LOG-PARSING,
  STATE-AND-IPC, API-CLIENT, TESTING, RELEASING, VERIFICATION-2026-09
- **Governance:** `AGENTS.md` + `REGOLE.md` + `METODO.md` (italiano)
- **Releases:** GitHub Releases + Velopack auto-update (Settings → Updates)

## Quick start (development)

```
npm install
npm run build      # esbuild (renderer + preload) + tsc (main/tests)
start.bat          # clears ELECTRON_RUN_AS_NODE (historical crash cause)
```

`start.bat` is the supported dev launcher: this machine has
`ELECTRON_RUN_AS_NODE=1` set globally; launching without clearing it makes
Electron run as plain Node (app exits / IPC undefined).

## Build & release

```
npm run typecheck && npm test    # 130+ tests (node:test)
npm run pack                     # Setup.exe + Portable + nupkg feed (Velopack)
npm run release                  # + vpk upload github (needs GITHUB_TOKEN)
```

Full process: `docs/RELEASING.md`.

## Verification

- Parser verified offline against 51 real logs (v3 vs v4, zero divergences).
- Interactive smoke via CDP: `node scripts/smoke.mjs` (dev or installed).
- Screenshot-based UI verification: replay driver (`PIKA_REPLAY`) →
  `artifacts/screens/` (see `docs/VERIFICATION-2026-09.md`).
