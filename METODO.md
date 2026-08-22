# METODO.md — Metodo di lavoro per agenti

> Complementa `AGENTS.md` e `REGOLE.md`. Lingua: italiano (procedura di
> processo). Il metodo si applica a ogni sessione di lavoro sul progetto.

## Step 0 — Prima di scrivere codice

1. **Leggi il piano** (`*.md` in `.local/share/kilo/plans/` o equivalente). Il
   piano è la fonte di verità: task ordinati, atomici, con commit per task.
2. **Leggi le sezioni critiche** delle doc di prodotto (HANDOVER, LOG-PARSING)
   prima di toccare il parser o lo stato.
3. **Esplora il codice esistente** per riuso e convenzioni.
4. Se il piano non esiste o è ambiguo → produrre prima il piano, non
   improvvisare il codice.

## Esecuzione

- **Task per task**, in ordine di dipendenza; mai tutto insieme.
- **Un subagent fresco per task** (approccio subagent-driven) con review tra i
  task. L'orchestratore assegna, non implementa in parallelo.
- **Parallelizzare** dove il piano lo segnala (task indipendenti).
- Ogni task termina con verifica (test/typecheck) e **commit dedicato**.

## Routing modelli

Regola d'oro: **il modello di punta pensa e pianifica, il modello di livello
inferiore implementa il piano.**

| Tier | Ruolo |
|---|---|
| Alto (es. Opus) | Step 0, design, analisi rischi, piani, ADR complessi, secondo giro D10 (deep review), spot-check |
| Medio (es. Sonnet) | Implementazione da piano, primo giro D10 (screening), ADR semplici, task meccanici |

Il tier medio non scrive codice senza un piano dettagliato del tier alto.

## D10 — Due giri di review agnostici

| Giro | Tier | Ruolo | Esito |
|---|---|---|---|
| 1 | Medio (istanza indipendente) | screening: deep/quality review fresca | BLOCKING / APPROVE |
| 2 | Alto (istanza indipendente) | deep code review finale, imparziale | BLOCKING / APPROVE |

- **Vincolo strutturale: il reviewer non è l'implementer.** Un agent non fa la
  review del proprio codice.
- Non saltare il secondo giro perché il primo è verde.

## Gate di validazione

1. **Code-Verified:** `npm run typecheck` + `npm test` verdi.
2. **D10:** 2 review indipendenti per ogni blocco; ADR per ogni decisione
   architetturale.
3. **Field-Verified:** checklist manuale sull'ambiente reale (Pika, Badlion e
   vanilla).
4. **Release:** installazione pulita, upgrade da v3 con config preservata,
   ciclo update end-to-end.

## ADR — Formato a 7 sezioni

Vedi `docs/adr/README.md`. Ogni ADR è un file `docs/adr/000N-titolo.md`.

## Controllo del context

- Sotto 60% di context: lavoro autonomo rispettando le regole.
- Oltre 60%: fermarsi e chiedere istruzioni all'owner (regola hard).
