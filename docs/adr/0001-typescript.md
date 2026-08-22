# ADR-0001 — TypeScript per main, preload e renderer

**Status:** Accepted

## Context
v3 è JavaScript non tipizzato: contratto IPC implicito, refactor rischiosi,
errori di tipo scoperti solo a runtime. Il piano v4 richiede una base pulita e
testata, con contratto IPC tipizzato.

## Decision
Tutto il codice v4 (main process, preload, renderer, test) è scritto in
TypeScript strict. `tsc` compila main/preload/test in CommonJS; `esbuild`
produce il bundle IIFE del renderer.

## Consequences
- Tipi condivisi tra main e renderer (src/shared) eliminano la deriva del
  contratto IPC.
- Strict mode (`noUncheckedIndexedAccess`) cattura classi di bug a compile time.
- Costo: toolchain più complessa (tsconfig + esbuild) e tipo `electron` da
  gestire.

## Alternatives
- JavaScript + JSDoc: non impone il contratto a compile time.
- Electron Forge + Webpack: più magia, meno controllo; v3 usa già electron-builder.

## Implementation notes
- `tsconfig.json`: rootDir `.`, outDir `dist`, module commonjs, strict.
- `tsconfig.renderer.json`: noEmit, lib DOM, include `renderer/ts` + `src/shared`.
- `build.mjs` orchestera: esbuild bundle → tsc.

## Validation
`npm run typecheck` e `npm test` verdi; nessun file `.js` di produzione.
