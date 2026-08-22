# ADR-0003 — Stato centralizzato in `src/main/state/`

**Status:** Accepted

## Context
In v3 lo stato critico è sparso tra `main.js` e `ipcHandlers.js`:
`shownPlayers`, `_partyMembers`, `_inGame`, coda lookup. Il porting pulito (v4)
richiede una fonte unica di verità per evitare derive e semplificare i test.

## Decision
Lo stato vive in `src/main/state/` come moduli singoli: `playerRegistry.ts`
(giocatori mostrati), `gameState.ts` (in-game/pregame), `partyState.ts`
(membri party), `lookupQueue.ts` (coda FIFO, concorrenza 6). I sottosistemi
comunicano tramite questi moduli (R3), mai via chiamate dirette tra handler.

## Consequences
- Comportamento osservabile identico a v3, ma testabile unitariamente.
- I listener del logWatcher e gli IPC handler leggono/scrivono lo stesso stato.

## Alternatives
- Stato in `main.ts` e passato per dependency injection: più cerimoniale, stesso
  risultato; i singleton modulari bastano per un processo single-instance.
- Un unico store centrale (tipo Redux): sovradimensionato.

## Implementation notes
- `playerRegistry`: Set di chiavi lowercased + snapshot.
- `gameState`: flag `inGame` con setter/getter.
- `partyState`: Set membri + operazioni add/remove/clear.
- `lookupQueue`: `enqueue` + `drain` con concorrenza ≤ 6.

## Validation
Test unitari su ogni modulo di stato; nessun import di stato da `main.ts` verso
`ipc/` che aggiri i moduli.
