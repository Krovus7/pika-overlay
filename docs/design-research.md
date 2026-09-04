# design-research.md — 2026 design directions for the Pika Overlay

Fonti raccolte il 2026-09-04 via ricerca web per la Fase 3 (grafica
CSS-first, reversibile). Riferimenti: headset.live (2026-03), lhm.gg blog
overlay broadcast esport (2026-07), wandr.studio Game HUD Design (2026-07),
esportteamcolors.com (2026-05), fontalternatives.com gaming typography
(2026-03), streamhub.world (2026-08), template esport dashboard (x-template,
aura, gamevault, muzli Kairos 2026).

## Principi raccolti (e come si applicano all'overlay)

1. **Gerarchia informativa e priorità** (headset.live, lhm.gg, wandr):
   - Le informazioni guardate di frequente stanno in posizione fissa e stabile
     (il nostro: titlebar, search bar, header colonne, footer — già fissi).
   - Head/valori numerici: leggibili a colpo d'occhio (density alta va bene,
     leggibilità domina). *Applicazione: header sticky con lista lunga.*
2. **Numeri tabulari** (fontalternatives, headset.live, Console/pubblicazioni
   typography): `font-variant-numeric: tabular-nums` per allineare le colonne
   numeriche; weight medium/bold per i numeri; Inter è già la font UI
   dell'overlay — basta la feature. *Applicazione: colonne FKDR/Finals/KD/
   WLR/Wins/Beds/WS right-aligned + tabular.*
3. **Contrasto validato sullo sfondo peggiore** (wandr, esportteamcolors):
   - Panel semi-trasparenti (~70% nero) e testo chiaro: il titolare di
     leggibilità è il pannello, non lo sfondo; mai affidarsi solo al colore.
   - Target WCAG AA 4.5:1 per il testo; nelle modalità low-opacity v2.8.4 ha
     già scrim+text-shadow (era esattamente il "worst case" per low opacity).
   - `colour is never the only carrier of meaning` (Game Accessibility
     Guidelines via wandr): gli stati riga devono avere anche shape/border/
     testo, non solo colore. *Applicazione: tollerare solo micro-ritocchi dei
     bordi stato — mai cambiare solo i colori.*
4. **Micro-interazioni = feedback di stato, mai loop** (lhm.gg, wandr, 100ms):
   - Animazione corta su cambi di stato (`<150 ms`), niente pulsing/loop.
   - Inserimento riga veloce e sottile; hover leggero; focus-visible per
     tastiera. *Applicazione: hover tr, focus ring, transition badge.*
5. **Identità 3 colori + neon accento su base scura** (esportteamcolors,
   2026 dashboard esport: dark navy base + purple accent + neutral):
   - "Regola dei 3 colori": primary/accent/neutral. Il nostro set
     (navy #121426 ≈ + accent viola #7c6af7 + neutral grigi) rispetta già la
     regola — nessuna nuova tinta, coerenza mantenuta (D2: identità v3).
   - Evitare cyberpunk estremo (scanline, grid 3D glow) — non è la nostra
     nicchia: overlay informativo, non streaming kit.

## Scelte per la v4.1 (Task 11-12, tutte CSS/reversibili)

| # | Intervento | Motivazione (fonte) |
|---|---|---|
| 1 | Numeri tabulari + right-align colonne numeriche (FKDR/Finals/KD/WLR/Wins/Beds/WS/Kills/Deaths/Bow) | allineamento scanning (fontalternatives) |
| 2 | Header tabella sticky nel wrapper scrollabile | gerarchia fissa (headset.live: posizioni stabili) |
| 3 | Hover riga + focus-visible netto su bottoni/input | accessibilità 2.4.7 + feedback <150 ms (wandr) |
| 4 | Stati riga più distinti (bordo 2px party/suspect/nicked/error) | mai solo colore (wandr/GAG) |
| 5 | Micro-animazioni: fade-in riga 120 ms, badge transition, niente loop | lhm.gg: animation communicates state, not delay |
| 6 | Settings: spacing coherente, righe form uniformi, stato salvataggio/errore già presente (v4.0.2), progress bar Updates già presente | coerenza col resto dell'app |

Fuori scope grafico: pattern cyberpunk, cambio font, nuove palette, layout
radicali (D2: identità v3 mantenuta, migliorie non drastiche).
