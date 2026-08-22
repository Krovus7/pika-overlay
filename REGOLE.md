# REGOLE.md — Forma operativa delle 10 regole

> Documento di governance per agenti e orchestratori. Complementa `AGENTS.md`
> (riassunto) e `METODO.md` (procedura). Lingua: italiano (regole di processo).

## R1 — Fase 0 chiusa prima del codice di produzione

Nessun codice di produzione prima della chiusura di Fase 0 (scaffold, docs di
governance, test di non-regressione verdi). La Fase 0 è chiusa quando i test
portati sono verdi e committati.

## R2 — Verificabilità

Ogni fatto tecnico poggia su: codice sorgente con percorso file, doc primaria,
o osservazione field-verified. Mai su README, memoria o assunzioni. Se un fatto
non è verificato, va verificato e documentato, non assunto.

## R3 — Stato condiviso, non chiamate dirette

I sottosistemi (log → stato → IPC → renderer) comunicano solo tramite lo stato
condiviso definito dal progetto (`src/main/state/`). Niente chiamate dirette tra
moduli che bypassano lo stato.

## R4 — Qualità e modularità

- File ≤ ~150 righe, una responsabilità per file.
- Niente `TODO`/`FIXME` in produzione.
- Errori mai silenziosi: sempre gestiti esplicitamente (log o propagazione).
- Commenti solo dove la logica non è auto-esplicativa.
- Nomi di variabili e funzioni chiari e descrittivi.

## R5 — Onestà sui gate

Gate A (Code-Verified: typecheck + test verdi) ≠ Gate B (Field-Verified:
comportamento reale verificato). Mai dichiarare "funziona" da scrivania.

## R6 — Fix sulla causa radice

Prima la causa radice, poi il fix. Mai debugging a tentativi. Un fix che non
spiega perché risolve il sintomo non è un fix.

## R7 — Test dove hanno senso

- Test di non-regressione (parser, stato, config, api con fetch mockato).
- Porting dei test v3 verde = contratto di non-regressione, prima di ogni
  refactor successivo.
- Un mock che finge il comportamento reale non è copertura.

## R8 — Atomicità

- Ogni modifica fa UNA sola cosa logica (fix, funzione, refactor).
- Mai mescolare scopi diversi in un singolo commit.
- Commit per task del piano (granularità media-grossa), non per micro-step.
- Dopo ogni modifica atomica: verifica (test/typecheck) prima di procedere.

## R9 — Riuso e parsimonia delle dipendenze

Prima di scrivere codice nuovo, controlla se esiste già una utility nel
progetto. Niente dipendenze esterne per problemi risolvibili con poche righe.

## R10 — ADR per decisioni architetturali

Ogni decisione architetturale → ADR nel formato a 7 sezioni (vedi
`docs/adr/README.md`). Nessuna promozione di codice sperimentale senza ADR.

---

Vincoli trasversali:

- **Soglia context 60%:** l'orchestratore si ferma e chiede istruzioni all'owner
  oltre il 60% del context.
- **D10 a due giri:** ogni blocco di codice passa 2 review indipendenti da agenti
  freschi (vedi METODO.md). Il reviewer non è mai l'implementer.
