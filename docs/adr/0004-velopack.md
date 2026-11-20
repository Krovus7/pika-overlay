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
- Auto-update: `UpdateManager` da npm `velopack`; check silenzioso all'avvio, ogni 6 ore
  mentre l'app resta aperta (se `updateAutoCheck` è attivo) e su richiesta;
  download/apply espliciti dall'utente.
- Avviso: quando lo stato diventa `available` l'overlay mostra una card in basso
  a destra (clic → Impostazioni › Updates, × → nascosta per quella versione fino
  al riavvio).

## Revisione 5.2.1 (sostituisce "nessun polling")
Il solo check all'avvio non bastava: l'app resta aperta per molte ore e, senza
avviso nell'overlay, nessuno vedeva la nuova versione (solo Settings › Updates
la mostrava). Ora: un `setInterval` da 6 h in main (`startPeriodicChecks`, non
tiene vivo il processo, legge `updateAutoCheck` a ogni tick; `checkForUpdates`
ha già il busy guard e in dev non fa richieste di rete) e la card nell'overlay. Costo: una
richiesta GET al feed ogni 6 h; il download resta esplicito. Lo stato `checking`
di un ricontrollo non nasconde la card già visibile.

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
