# ADR-0007 — Config compatibile v3 con migrazione non distruttiva

**Status:** Accepted

## Context
La config utente di v3 vive in `%APPDATA%\pika-overlay\config.json` (stesso
`name` in package.json). v4 deve ripartire da lì: migrazione+validazione dello
schema con chiavi legacy (`fkdrThresholds`, formato soglie piatto → per-ratio),
mai distruttiva.

## Decision
- Stesso `name` (`pika-overlay`) e stesso percorso userData; in `main.ts` il
  percorso viene fissato esplicitamente (`app.setPath('userData', …/pika-overlay)`)
  per garantire il path anche nella versione impacchettata.
- `src/main/config.ts`: schema tipizzato, defaults completi, merge con i valori
  salvati, migrazione delle chiavi legacy (soglie piatte → `ratioThresholds`
  per-ratio), validazione dei valori.
- Backup `config.json.bak` al primo avvio v4 (prima di riscrivere).
- Nessuna chiave rimossa: quelle legacy vengono migrate, non eliminate.

## Consequences
- Upgrade da v3 senza perdita di impostazioni.
- Il config resta un file JSON leggibile e modificabile a mano.

## Alternatives
- Nuovo nome file (`config-v4.json`): rompe la compatibilità con v3.
- Riscrittura con electron-store: dipendenza non necessaria (v3 ha già un
  ConfigStore custom che non la usa — D9).

## Implementation notes
- `config.ts` espone: `loadConfig()`, `get()`, `set()`, `setMany()`,
  `getAll()`, `migrate(raw)` (pura e testabile).
- Chiavi `update*` nuove introdotte in v4 con defaults.

## Validation
Test di migrazione: config v3 legacy (con `fkdrThresholds` e soglie piatte) →
schema v4 con `ratioThresholds` popolato; file corrotto → defaults; backup
scritto al primo avvio.
