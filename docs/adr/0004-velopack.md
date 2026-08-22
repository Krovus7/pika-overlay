# ADR-0004 — Velopack per installer e auto-update

**Status:** Accepted

## Context
v3 usa NSIS (electron-builder) senza auto-update. Il piano v4 (D4) richiede
Setup/Portable via `vpk pack`, feed via GitHub Releases di `Krovus7/pika-overlay`
(repo pubblica) e auto-update in-app con il pacchetto npm `velopack`
(UpdateManager). Ambiente: .NET SDK presente (`C:\Program Files\dotnet`), quindi
`vpk` installabile come dotnet tool.

## Decision
- Installer/portable: `vpk pack` (packId `pika-overlay`, channel `win`) a partire
  da `win-unpacked` prodotto da `electron-builder --dir`.
- Feed: `vpk upload github` verso GitHub Releases.
- Auto-update: `UpdateManager` da npm `velopack`; check silenzioso all'avvio e su
  richiesta; download/apply espliciti dall'utente; nessun polling.

## Consequences
- Ciclo update end-to-end verificabile con doppio rilascio di prova (v4.0.0 →
  v4.0.1).
- Il download degli update è esplicito: nessun rallentamento del gioco in
  background.
- Dipendenza dal tool `vpk` (dotnet tool) solo in fase di release, non in dev.

## Alternatives
- electron-updater: ecosistema diverso dal piano e richiede NSIS/AppImage;
  il piano (D4) sceglie Velopack.
- Aggiornamento manuale (re-download): escluso dal piano.

## Implementation notes
- `update/velopackUpdate.ts`: `VelopackApp.build().run()` all'avvio +
  `UpdateManager` per check/download/apply.
- `RELEASING.md` documenta: `dotnet tool install -g vpk`, `vpk pack`,
  `vpk upload github --repoOwner Krovus7 --repoName pika-overlay --publish --tag vX.Y.Z`.

## Validation
Rilascio di prova v4.0.0 + v4.0.1: installazione pulita, upgrade da v3 con
config preservata, ciclo update verificato (Task 13).
