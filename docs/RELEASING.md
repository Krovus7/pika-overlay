# RELEASING.md — Release process (Velopack)

Pika Overlay v5 ships via Velopack: a `Setup.exe` installer, a portable zip and
an update feed hosted on GitHub Releases of `Krovus7/pika-overlay` (public
repo). In-app auto-update uses the same feed (ADR-0004).

## Prerequisites

- Node.js >= 20 (system install), npm.
- .NET SDK (`C:\Program Files\dotnet`) — needed for the `vpk` dotnet tool.
- `vpk` installed once:
  ```
  dotnet tool install -g vpk
  ```
- A GitHub token with `repo` scope for uploads in the `GITHUB_TOKEN` env var.
  `vpk` 1.2.0 does not read that variable itself; `build.mjs` passes it as
  `--token`. With the GitHub CLI logged in: `set GITHUB_TOKEN=` + the output
  of `gh auth token`.

## Build a release (local artifacts, no upload)

```
npm install
npm run pack
```

This runs, in order:

1. `build.mjs build` — esbuild renderer bundle + esbuild preload bundle +
   `tsc` main/tests. The icon is not regenerated here: `assets/icon.ico` and
   `assets/icon.png` are committed; run `npm run icon` after editing
   `assets/icon.svg` / `assets/icon-small.svg` (`scripts/make-icon.mjs`, runs
   inside Electron) and commit the result. `vpk pack` uses `assets/icon.ico`.
2. `npx electron-builder --dir` — `release/win-unpacked` (input for vpk).
3. `vpk pack -u pika-overlay -v <version> -p release/win-unpacked -o release -c win -e PikaOverlay.exe -i assets/icon.ico --packTitle "Pika Overlay" --packAuthors "AcquaPanna"`
   — produces in `release/`:
   - `pika-overlay-win-Setup.exe` — installer
   - `pika-overlay-win-Portable.zip` — portable app
   - `pika-overlay-<version>-full.nupkg` + `RELEASES` + `releases.win.json` — update feed

## Publish a release (feed for auto-update)

```
npm run release
```

Start from an empty `release/` folder. The command runs:

```
vpk download github --repoUrl https://github.com/Krovus7/pika-overlay -o release -c win
(pack, as above — with the previous release present it also builds pika-overlay-<version>-delta.nupkg)
vpk upload github -o release -c win --repoUrl https://github.com/Krovus7/pika-overlay --publish --tag v<version> --token <token>
```

5.0.0 was published on 2026-11-13 by running these three steps by hand;
`npm run release` was changed afterwards to run the same steps and has not
been run end to end in that form.

The tag is derived from `package.json` version (e.g. `v5.0.0`). Use `--pre`
for pre-releases (test cycle) instead of stable.

## Version bump checklist

1. `package.json` → `version` (single source of truth). The overlay labels
   (title bar, settings header, Updates tab) and the tray label read it:
   `build.mjs` injects `__APP_VERSION__` into the renderer bundle, the tray
   imports `package.json`. `renderer/overlay.html` holds no version text.
2. `npm run typecheck && npm test` green.
3. `npm run pack` and verify artifacts.
4. `npm run release` (or manual `vpk upload github ...`).

## Update cycle verification (before public release)

**Verified 2026-09-04 (4.0.2 → 4.1.0, in-app, delta):**
`scripts/update-cycle.mjs` drives the installed app over CDP: Updates tab →
"Update available: v4.1.0" → apply → download delta → app exits → updater
installs → disk `sq.version` = 4.1.0 → smoke 11/11. The full
check/download/apply/restart chain is now proven against the GitHub feed.

**Verified 2026-11-13 (4.1.0 → 5.0.0, in-app, delta of 0.9 MB):** same script
with target `5.0.0` on an installed 4.1.0: "Update available: v5.0.0" →
apply → app exits → disk `sq.version` = 5.0.0 → app restarts; then
`scripts/smoke.mjs` on the installed 5.0.0: 16/16, settings and API key kept.

`update-cycle.mjs` takes the target version as its fifth argument
(`<exe> <cwd> <installDir> [version]`, default `4.1.0`).

Manual checklist before a major public release:

1. **Clean install:** on a machine/VM without v3, install `Setup.exe` and
   verify first-run + tray + overlay.
2. **Upgrade from v3:** install over an existing v3 config
   (`%APPDATA%\pika-overlay\config.json`) — settings must survive and
   `config.json.bak` must appear.
3. **In-app update:** from the installed app: Settings → Updates →
   "Check for updates" → "Update & restart" (or `scripts/update-cycle.mjs`).

## Dev-mode notes

- `start.bat` clears `ELECTRON_RUN_AS_NODE` (historical startup-crash cause,
  HANDOVER v2.1) and launches the unpackaged app. **The installed app also
  fails to start from shells where `ELECTRON_RUN_AS_NODE=1` is set** — always
  launch from the Start menu/Explorer or clear the var first.
- Auto-update is disabled in dev (`app.isPackaged` guard): Settings → Updates
  shows a "disabled" message. The update UI is fully testable in the packaged
  app.
