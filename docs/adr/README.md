# ADR — Architecture Decision Records

Ogni decisione architetturale del progetto viene registrata come ADR:
`docs/adr/000N-titolo-breve.md`.

## Formato (7 sezioni)

1. **Status** — `Draft` | `Accepted` | `Superseded by 000N` | `Rejected`
2. **Context** — problema, vincoli, alternative considerate (con pro/contro)
3. **Decision** — la scelta, in una frase chiara e verificabile
4. **Consequences** — impatti positivi e negativi, rischi, costi
5. **Alternatives** — cosa è stato scartato e perché
6. **Implementation notes** — dettagli concreti: file, chiavi config, contratti
   IPC, comandi build (per chi implementa)
7. **Validation** — come si verifica che la decisione sia stata applicata
   correttamente (test, gate, checklist field)

## Indice ADR

| # | Decisione | Stato |
|---|---|---|
| 0001 | TypeScript per main/preload/renderer | Accepted |
| 0002 | Architettura modulare Pika-specifica (no adapter framework) | Accepted |
| 0003 | Stato centralizzato in `src/main/state/` | Accepted |
| 0004 | Velopack per installer e auto-update (npm `velopack`) | Accepted |
| 0005 | Redesign del pannello Impostazioni (overlay invariato) | Accepted |
| 0006 | `node:test` come framework di test | Accepted |
| 0007 | Config compatibile v3 con migrazione non distruttiva | Accepted |

Le ADR numerate vivono nei file `0001-*.md`, `0002-*.md`, ecc.
