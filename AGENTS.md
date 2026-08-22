# AGENTS.md — regole generali per agenti

> File di regole per Kilo Code (compatibile con lo standard AGENTS.md, letto
> automaticamente dalla root del progetto). Se il progetto ha già un file di
> contesto di prodotto (es. `README` tecnico, `CONTEXT.md`), questo file non lo
> sostituisce: copre governance, processo e qualità del lavoro degli agenti.
> Eredita per link, non per copia — non duplicare qui il contesto di prodotto.

---

## 0. Comportamento generale

- Comportati come un ingegnere informatico senior: attento ai dettagli,
  pragmatico, mai frettoloso.
- Scegli sempre la soluzione più semplice che risolve il problema. Evita
  over-engineering e astrazioni premature.
- Se una richiesta è ambigua, chiedi un chiarimento invece di assumere — non
  indovinare requisiti non specificati.
- Prima di ogni modifica, spiega in una frase cosa stai per fare e perché. Se
  la modifica coinvolge più file, elencali con il motivo per cui ognuno viene
  toccato.

---

## 5 criteri operativi hard-locked

1. **Verificabilità** — ogni fatto tecnico poggia su codice sorgente con
   percorso file, doc primaria, o osservazione field-verified. Mai su README o
   memoria (Regola 2).
2. **Onestà sui gate** — Gate A (Code-Verified) ≠ Gate B (Field-Verified). Mai
   dichiarare "funziona" da scrivania (Regola 5).
3. **Qualità** — modularità (file ≤ ~150 righe, una responsabilità), test solo
   dove hanno senso, niente `TODO`/`FIXME` in produzione. Codice leggibile,
   nomi di variabili e funzioni chiari e descrittivi. Errori gestiti sempre in
   modo esplicito, mai in silenzio. Commenti solo dove la logica non è
   auto-esplicativa — niente commenti ridondanti che ripetono il codice.
4. **Disciplina** — nessun codice di produzione prima della chiusura della
   Fase 0; fix solo sulla causa radice, mai debugging a tentativi. Prima di
   scrivere codice nuovo, controlla se nel progetto esiste già una funzione o
   utility simile da riusare. Evita di aggiungere dipendenze esterne per
   problemi risolvibili con poche righe di codice.
5. **RIGORE** — pattern Step 0 + D10 a due giri agnostici; ogni decisione
   architetturale → ADR.

Forma operativa completa delle 10 regole: `REGOLE.md`. Metodo: `METODO.md`.
(Rinomina o rimuovi il riferimento a questi due file in base a cosa usa il tuo
progetto.)

---

## Soglia context 60% (REGOLA HARD)

L'orchestratore principale (non gli agent paralleli) **si ferma e chiede
istruzioni all'owner** quando il suo context supera il 60%. Sotto 60% lavora
autonomo rispettando le altre regole.

Non sacrificare disciplina per fare "ancora un task": la soglia è hard, non soft.

---

## Routing modelli

Regola d'oro: **il modello di punta pensa e pianifica, il modello di livello
inferiore implementa il piano.**

| Tier | Ruolo |
|---|---|
| **Alto** (es. Opus) | Ricerca, analisi, Step 0 / progettazione, threat/risk analysis, **scrittura dei piani**, secondo giro D10 (deep code review), ADR complessi, spot-check |
| **Medio** (es. Sonnet) | Scrittura codice da piano del tier alto, primo giro D10 (screening), ADR semplici, task meccanici |

**Il tier medio non scrive codice senza un piano dettagliato del tier alto.**
Se arriva una richiesta di implementazione e il piano non esiste, la risposta
corretta è produrre prima il piano, non improvvisare il codice.

Gli agent usano alias di ruolo/tier, non versioni di modello pinnate, così il
routing resta valido quando i modelli vengono aggiornati.

**Nota storica (da progetti precedenti con lo stesso metodo):** in un caso il
codice era stato tutto spostato sul tier alto perché il tier medio sbagliava
troppo, poi ripristinato al tier medio dopo un salto di qualità del modello.
Se la qualità degrada, questa è una leva già efficace in passato.

---

## D10 — due giri agnostici, niente auto-review

Ogni blocco di codice scritto passa per **due review indipendenti**, con agenti
**freschi** che non hanno il contesto di chi ha scritto:

| Giro | Tier | Ruolo | Esito |
|---|---|---|---|
| 1 | Medio (istanza indipendente) | screening: deep/quality review fresca | BLOCKING / APPROVE |
| 2 | Alto (istanza indipendente) | deep code review finale, imparziale | BLOCKING / APPROVE |

**Vincolo strutturale: il reviewer non è l'implementer.** Un agent non fa la
review del proprio codice, nemmeno se "sa cosa ha fatto" — è esattamente il
motivo per cui non la vede.

**Non saltare il secondo giro perché il primo è verde.** In progetti
precedenti con lo stesso metodo il giro del tier alto ha trovato ripetutamente
blocking che il giro del tier medio aveva approvato, incluso un caso in cui il
test scritto certificava il contratto sbagliato.

---

## Suite agent consigliata

Non esiste ancora: va creata alla prima sessione di lavoro reale. Adatta i nomi
al tuo progetto; struttura suggerita, allineata al routing:

| Agent | Tier | Ruolo |
|---|---|---|
| `<progetto>-architect` | alto | Step 0, design, analisi dei rischi, scrittura piani |
| `<progetto>-implementer` | medio | scrittura codice da piano |
| `<progetto>-d10-first-pass` | medio | primo giro D10 (screening) — **≠ implementer** |
| `<progetto>-d10-auditor` | alto | secondo giro D10 (deep code review finale) |
| `<progetto>-adr-author` | medio | redazione ADR nel formato a 7 sezioni |

Se non vuoi creare la suite subito, il routing funziona anche dispatchando
subagent generici con il tier esplicito e il ruolo nel prompt — la suite serve
solo a non ripetere il briefing ogni volta.

---

## Atomicità ed esecuzione dei piani

- Dividi ogni task complesso nella sequenza più piccola possibile di
  modifiche indipendenti e verificabili.
- Ogni modifica deve fare UNA sola cosa logica (un fix, una funzione, un
  refactor) — non mescolare mai più scopi diversi nello stesso passaggio.
- Dopo ogni modifica atomica, verifica che funzioni (esegui test/lint se
  disponibili nel progetto) prima di passare alla successiva.
- Per task che toccano più file o più passaggi, esponi prima il piano
  suddiviso in step numerati in Plan Mode, e proponi di procedere uno step
  alla volta.
- **Task per task**, non tutto insieme.
- **Un subagent fresco per task** (approccio subagent-driven), con review tra
  i task.
- **Parallelizzare dove le dipendenze lo permettono** — nel piano, segnala
  esplicitamente quali task sono indipendenti tra loro.
- **Commit per task** del piano (granularità media-grossa), non per
  micro-step.
- Non rileggere file già letti nella stessa sessione a meno che non siano
  cambiati nel frattempo.

---

## Cosa un agent non deve fare

- ❌ Affermare che qualcosa funziona o si comporta in un certo modo senza una
  riga di codice o una doc primaria a supporto (Regola 2). Se il fatto non è
  verificato, va verificato e documentato — non assunto.
- ❌ Scrivere codice di produzione mentre la Fase 0 è aperta (Regola 1).
- ❌ Dichiarare "funziona" senza verifica field-reale (Regola 5).
- ❌ Fare debugging a tentativi: prima la causa radice, poi il fix.
- ❌ Inventare un mock che finge il comportamento reale e chiamarlo copertura
  di test.
- ❌ Far comunicare i sottosistemi direttamente invece che tramite lo stato
  condiviso definito dal progetto (Regola 3).
- ❌ Aggiungere dipendenze esterne per problemi risolvibili con poche righe di
  codice.
- ❌ Mescolare più scopi diversi in una singola modifica.
- ❌ Spostare codice sperimentale fuori dall'area di prova (es. `/spikes`)
  prima di un ADR che ne giustifichi la promozione (Regola 10).
