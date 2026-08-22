# ADR-0002 — Architettura modulare Pika-specifica, no adapter framework

**Status:** Accepted

## Context
Il piano v4 esclude framework multi-server (D5): le logiche restano
Pika-specifiche. Serve però una struttura modulare e leggibile che possa essere
copiata come base per altri server in futuro.

## Decision
Nessun adapter framework. Moduli con una responsabilità ciascuno (file ≤ ~150
righe): `log/` per il parsing, `state/` per lo stato condiviso, `api/` per il
client Pika, `ipc/` per il contratto. Tutte le logiche restano Pika-specifiche
ma isolate dietro confini chiari.

## Consequences
- Copiare per un altro server = riscrivere i moduli `log/` e `api/` mantenendo
  contratti stabili.
- Nessuna astrazione astratta prematura: le interfacce emergono dal riuso reale.

## Alternatives
- Adapter framework (interfacce ServerLogSource, StatsProvider…): over-engineering
  per un singolo server; il piano la esclude esplicitamente (D5).

## Implementation notes
Struttura: `src/main/{state,ipc,log,api,update}`, `src/shared`, `renderer/ts`.

## Validation
Ogni modulo ha una responsabilità e importa solo ciò che gli serve; nessuna
dipendenza astratta multi-server nel codice.
