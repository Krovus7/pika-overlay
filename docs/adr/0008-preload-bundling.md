# ADR-0008 — Preload with esbuild bundling (sandbox rimane attivo)

**Status:** Accepted

## Context
Il preload compilato da `tsc` faceva `require("./shared/ipc-contract")` —
un modulo locale. Dal commit Electron 20 i renderer senza
`nodeIntegration: true` sono **sandboxati di default**; nei preload sandboxati
`require` supporta solo `electron` e pochi builtin, mai moduli locali
("a bundler is required if you need to split preload code into multiple files"
— doc Electron `docs/tutorial/sandbox.md`). Conseguenza a catena verificata a
runtime (`--enable-logging`):

1. `Unable to load preload script: dist/src/preload.js`
2. `Error: module not found: ./shared/ipc-contract`
3. `Uncaught TypeError: Cannot read properties of undefined (reading 'getAllConfig')`
   → bundle renderer interrotto → nessun listener → UI resa ma inerte.

Sintomo field-verified dall'owner (installazione 4.0.1: nessuna interazione).

## Decision
Il preload viene **bundlato con esbuild** in un singolo file CJS
(`dist/src/preload.bundle.js`, `external: ['electron']`), così le costanti di
`src/shared/ipc-contract.ts` sono in-lineate e non resta alcun `require`
locale. Il sandbox resta attivo — nessun `sandbox: false`.

## Consequences
- Il contratto IPC non cambia (stesse costanti, in-lineate nel bundle).
- Regola: ogni modifica a `src/preload.ts` richiede `npm run build`
  (il preload è solo generato, mai compilato direttamente — escluso dal
  `tsconfig.json` per evitare file vetusti `dist/src/preload.js`).
- `windowManager.ts` punta a `dist/src/preload.bundle.js`.
- Guard difensivo in `renderer/ts/overlay.ts`: se `window.pikaOverlay` manca,
  il badge mostra "Preload failed" invece di un crash silenzioso.

## Alternatives
- `sandbox: false`: indebolirebbe la sicurezza senza necessità.
- Require UMD con esbuild legacy: meno controllato; il CJS puro è il formato
  documentato per i preload.

## Implementation notes
- `build.mjs`: `bundlePreload()` (esbuild, cjs, platform node, external
  electron) eseguito in `buildAll` prima di `compileMain`.
- Lo smoke dev è il gate: nessun errore console e `window.pikaOverlay` definito.

## Validation
`npm run build` + smoke dev senza errori (`--enable-logging` per il console
del renderer); installazione 4.0.2: ⚙ apre le impostazioni, dropdown, ricerca
funzionano (stessa verifica della 4.0.1, che falliva).
