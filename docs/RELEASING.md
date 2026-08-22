# RELEASING.md — Release process (Velopack)

Pika Overlay v4 ships via Velopack: a `Setup.exe` installer, a portable zip and
an update feed hosted on GitHub Releases of `Krovus7/pika-overlay` (public
repo). In-app auto-update uses the same feed (ADR-0004).

## Prerequisites

- Node.js >= 20 (system install), npm.
- .NET SDK (`C:\Program Files\dotnet`) — needed for the `vpk` dotnet tool.
- `vpk` installed once:
  ```
  dotnet tool install -g vpk
  ```
- A GitHub token with `repo` scope for uploads: `GITHUB_TOKEN` env var
  (or `--token` flag on `vpk upload github`).

## Build a release (local artifacts, no upload)

```
npm install
npm run pack
```

This runs, in order:

1. `build.mjs build` — esbuild renderer bundle + `tsc` main/preload/tests.
2. `npx electron-builder --dir` — `release/win-unpacked` (input for vpk).
3. `vpk pack -u pika-overlay -v <version> -p release/win-unpacked -o release -c win`
   — produces in `release/`:
   - `pika-overlay-win-Setup.exe` — installer
   - `pika-overlay-win-Portable.zip` — portable app
   - `pika-overlay-<version>-full.nupkg` + `RELEASES` + `releases.win.json` — update feed

## Publish a release (feed for auto-update)

```
npm run release
```

Same as `pack`, then:

```
vpk upload github -o release -c win --repoUrl https://github.com/Krovus7/pika-overlay --publish --tag v<version>
```

The tag is derived from `package.json` version (e.g. `v4.0.0`). Use `--pre`
for pre-releases (test cycle) instead of stable.

## Version bump checklist

1. `package.json` → `version` (single source of truth).
2. `renderer/overlay.html` → both `vX.Y.Z` labels (titlebar + settings logo).
3. `npm run typecheck && npm test` green.
4. `npm run pack` and verify artifacts.
5. `npm run release` (or manual `vpk upload github ...`).

## Update cycle verification (before public release)

1. **Clean install:** on a machine/VM without v3, install `Setup.exe` and
   verify first-run + tray + overlay.
2. **Upgrade from v3:** install over an existing v3 config
   (`%APPDATA%\pika-overlay\config.json`) — settings must survive and
   `config.json.bak` must appear.
3. **v4.0.0 → v4.0.1:** release a patch (or pre-release), then in the installed
   app: Settings → Updates → "Check for updates" → "Update & restart".

## Dev-mode notes

- `start.bat` clears `ELECTRON_RUN_AS_NODE` (historical startup-crash cause,
  HANDOVER v2.1) and launches the unpackaged app.
- Auto-update is disabled in dev (`app.isPackaged` guard): Settings → Updates
  shows a "disabled" message. The update UI is fully testable in the packaged
  app.
- Never run `electron .` from a shell where `ELECTRON_RUN_AS_NODE=1` is set.
