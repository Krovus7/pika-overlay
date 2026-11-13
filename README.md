# Pika Overlay

Electron overlay with BedWars player stats for [Pika-Network](https://www.pika-network.net) (v5, TypeScript).

It reads the Minecraft `latest.log`, detects players from pre-game joins, kill
feed, bed breaks, team tags and tab-list rosters, and shows their BedWars
stats (`stats.pika-network.net`) in a transparent always-on-top overlay.

- **Developer:** AcquaPanna
- **Governance:** `AGENTS.md` + `REGOLE.md` + `METODO.md` (Italian)
- **Releases:** GitHub Releases + Velopack auto-update (Settings → Updates)

## API key (required since v5)

Pika's stats API needs a personal key. Without one the overlay sends no
requests and shows a banner instead.

1. In game run `/linkaccount` (links your Discord account).
2. Run `/apikey`. Pika sends you the key.
3. Open Settings → API, paste the key, press **Save key**. **Test** checks a
   key without saving it.

The key is stored in the app's `config.json` (`%APPDATA%\pika-overlay\`) as
`apiKey`. `/apikey reset` in game replaces a leaked key. Scripts read the key
from the `PIKA_API_KEY` environment variable. Details: `docs/API-CLIENT.md`.

## Features

- **Detection from the log:** pre-game joins, kill feed, bed breaks, team tags,
  tab-list roster. Final kills remove the victim.
- **Row statuses instead of guesses:** `NICKED`, `NOT FOUND`, `API OFF`,
  `NO STATS`, `NO GAMES`, `ERROR`, `RATE LIMITED`, `KEY REQUIRED`
  (`docs/FUNCTIONALITY.md`, `docs/adr/0010-status-model-and-api-key.md`).
- **API health banner:** missing or rejected key, rate-limit countdown, API
  unreachable.
- **Party handling:** members from `Party ... joined/left/kicked/disbanded`
  lines and `/p info` are looked up first, pinned on top (diamond marker) and
  kept when the lobby changes. `/p info` when not in a party clears them.
- **Dark and light themes** (title-bar toggle) and a legibility floor that
  strengthens as the background opacity drops (`docs/adr/0011-themes-and-legibility.md`).
- **Layouts:** detailed and compact; row density, interface scale, column
  order and visibility, tier colors and thresholds.
- **Period and mode filters:** All Time / Weekly / Monthly / Yearly, Overall /
  Solo / Duo / Triples / Quad.
- **Hotkeys:** F4 show/hide, F5 clear (remappable in Settings → General).

## Quick start (development)

```
npm install
npm run build      # esbuild (renderer + preload) + tsc (main/tests)
start.bat          # clears ELECTRON_RUN_AS_NODE, then launches Electron
```

If `ELECTRON_RUN_AS_NODE=1` is set globally, Electron starts as plain Node
(app exits, IPC undefined). `start.bat` unsets it; from another shell unset it
yourself before `npm start`.

Other dev commands:

```
node build.mjs renderer        # rebuild only the renderer bundle
npm run icon                   # assets/icon.svg + icon-small.svg → icon.png, icon.ico
PIKA_SHOTS=1 npm start         # screenshot driver (demo rows, no network) → artifacts/screens/
node scripts/smoke.mjs         # CDP smoke test incl. live lookups (PIKA_API_KEY, SMOKE_PLAYER)
node scripts/live-api-check.mjs   # real API classification check (PIKA_API_KEY)
node scripts/replay-logs.mjs   # real logs through the parser vs the frozen v3 reference
```

## Build & release

```
npm run typecheck && npm test    # node:test suite
npm run pack                     # Setup.exe + Portable + nupkg feed (Velopack)
npm run release                  # + vpk upload github (needs GITHUB_TOKEN)
```

Full process: `docs/RELEASING.md`.

## Verification status

Code-verified and the live-API/smoke runs are recorded in
`docs/VERIFICATION-2026-11.md`. A full live BedWars session, the packaged build
and the in-app update to 5.0.0 are **not yet field-verified** (Gate B open).

## Documentation

| Doc | Content |
|---|---|
| `docs/ARCHITECTURE.md` | module map, data flow, invariants |
| `docs/FUNCTIONALITY.md` | user-visible behavior, statuses, settings |
| `docs/STATE-AND-IPC.md` | state owners, IPC channels and events |
| `docs/API-CLIENT.md` | API facts, status classification, rate budget, caches |
| `docs/LOG-PARSING.md` | log parser contract |
| `docs/TESTING.md` | test suites, scripts, gates |
| `docs/RELEASING.md` | pack, publish, update-cycle checks |
| `docs/VERIFICATION-2026-11.md` | v5 verification record (`-2026-09` is the v4 one) |
| `docs/adr/` | architecture decision records (index in `docs/adr/README.md`) |
| `docs/design-research.md` | v4 design research notes (historical) |
