# ADR-0006 — `node:test` come framework di test

**Status:** Accepted

## Context
v3 usa un runner custom (`test_logwatcher.js`, ~930 righe, zero dipendenze). Il
piano v4 (D8) richiede di portare tutte le sezioni 1–15 + nuovi test (stato,
apiClient con fetch mockato, migrazione config) con zero dipendenze aggiuntive.

## Decision
`node:test` (built-in Node) come framework: `node --test dist/tests/`. I test
sono TypeScript compilati da tsc insieme al main process. `test_api.js` di v3
diventa uno script manuale live (non in suite).

## Consequences
- Zero dipendenze di test; runner stabile e standard.
- I test girano sul Node di sistema (v24), non dentro Electron.

## Alternatives
- Vitest/Jest: dipendenze aggiuntive non giustificate (regola R9).
- Runner custom di v3: da non riportare, `node:test` lo sostituisce.

## Implementation notes
- `tests/` con `.ts`, compilati in `dist/tests/` (rootDir `.`).
- `npm test` = build + `node --test dist/tests/`.
- Il mock del fetch usa l'assegnazione `globalThis.fetch` con restore in
  `after()`.

## Validation
`npm test` verde: 15 sezioni portate + test nuovi; nessuna devDependency di test.
