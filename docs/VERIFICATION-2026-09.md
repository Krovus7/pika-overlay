# VERIFICATION-2026-09

Offline verification of Pika Overlay v4.0.2 (no game open) — Fase 2 del piano
quality-upgrade. **Gate A (code-verified) completo; gate B definitivo resta
l'owner in gioco.**

## 1. Replay parser su log reali (51 file)

Tool: `scripts/replay-logs.mjs` — stessi parser (v4 `LineParser` vs v3
`logWatcher`) sull'identico flusso di righe reali, da offset 0.

| Metrica | Risultato |
|---|---|
| File processati | 51 (35 logs v3 + 15 Badlion .gz + latest.log 311 KB) |
| Righe chat processate | ~90.000 |
| Nomi rilevati (unic) | fino a 369/sessione |
| Violazioni anti-false-positive | **0** (nessun nome fuori `RE_MC_NAME` o in blocklist) |
| Divergenze v3 vs v4 | **0** (event stream identico per ogni file) |

Report completo: `artifacts/replay/report.md` (+ JSON per file, non committati).
Nota: i log Badlion di giorni non-Pika (es. Coral, 2026-07-24) producono 0
rilevamenti — comportamento corretto, non un bug.

## 2. App in dev con replay + screenshot (vision review)

Tool: PIKA_REPLAY + driver `src/main/replay.ts` → 12 screenshot in
`artifacts/screens/`, su log reale `2026-07-31-1` (party 11, games 14).

| Stato | Esito |
|---|---|
| 01 tabella base | ✅ 116 righe reali: self-pin (AcquaPanna, API Off), party ♦, NICKED 🎭 (rosso, in alto), API Off 🔒, tier color FKDR/KD/WLR, badge sorgente, footer, status "116 PLAYERS" |
| 02 bulk search | ✅ Jeb_/Sky → API Off; FakeTestNick99/AmNoOne1337 → NICKED (badge rosso + sorgente Paste) — semantica API reale |
| 03/04 dropdown period/mode | ✅ apertura, chevron, selezione |
| 05–09 settings (tutti i tab) | ✅ General (log path, identità, overlay, hotkey, opacity 90%), Columns, Stats, Updates, Debug |
| 08 Updates in dev | ✅ stato onesto "Updates are only available in the installed app" (non-packaged) |
| 10 compact | ✅ sole colonne LV/Player/FKDR/WS/Source |
| 11/12 low opacity (<15%) | ✅ switcher 🌙/☀ visibile, testo leggibile in entrambi i contrasti |

Osservazioni: nessun difetto bloccante; logica titole-bar fissa (v2.8.4)
mantiene leggibile il logo a bassa opacità in entrambi i modi.

## 3. Live API check (netto reale, nessun mock)

`scripts/live-api-check.mjs` — client v4 reale contro stats.pika-network.net:

- 5/5 nomi inesistenti → **NICKED** ✓
- 3/3 account senza data BW → **API_OFF** ✓
- 4/4 account con stats BW → **NORMAL** (stats complete) ✓
- Intervalli/modalità: Dream total/ALL → NORMAL; weekly/SOLO e yearly/QUAD →
  **API_OFF** (dato onesto: nessun entry per quella finestra/modo — la
  classificazione non è mai errore) ✓
- Burst controllato 6 concorrenti → **0 risposte rate-limited**; l'API tollera
  la concorrenza dell'app. Durante il replay sono apparsi 429 su burst
  maggiori con retry esponenziale recuperati (nessun errore residuo in UI).

## 4. Conclusione

Gate A: typecheck + test verdi (130), replay 0 divergenze, screenshots
conformi alla checklist, API live corretta. Nessun fix richiesto (Task 9:
nessun difetto trovato). Rimane: Fase 3 (grafica, CSS-first reversibile) e
gate B finale dell'owner in partita (lobby affollata, /p info, final kill,
nicked, periodo/modalità, hotkey, opacità).
