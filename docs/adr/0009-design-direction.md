# ADR-0009 — Direzione design v4.1 (CSS-first, reversibile)

**Status:** Accepted

## Context
La grafica dell'overlay era copiata 1:1 da v3 (D2 del piano v4). La quality
upgrade consente migliorie non drastiche e reversibili (overlay) e un redesign
più libero (settings), mantenendo l'identità v3 (palette navy + accento
viola, font Inter, layout a tabella).

## Decision
Migliorie CSS-first + una classe per le colonne numeriche nel rowBuilder,
documentate in `docs/design-research.md` (fonti 2026):

1. **Numeri tabulari + right-align** sulle colonne numeriche
   (FKDR/Finals/KD/WLR/Wins/Beds/WS/Kills/Deaths/Bow): `font-variant-numeric:
   tabular-nums` + header corrispondenti right-aligned (fonti:
   fontalternatives.com, headset.live — allineamento colonne statistiche).
2. **Focus-visible ring** (accento viola, outline-offset) su bottoni degli
   overlay/settings: accessibilità da tastiera, mai affidarsi solo a color/hover
   (fonte: wandr.studio / Game Accessibility Guidelines).
3. **Spacing coherence nel settings**: ritmo orizzontale dei form row
   (8px), già coerente con il resto; nessun cambio di struttura HTML.
4. **Niente pattern cyberpunk** (scanline, grid 3D, glow eccessivi): il
   prodotto è un overlay informativo, non un kit da streaming (fonte:
   esportteamcolors.com regola dei 3 colori; i template "cyberpunk" non
   corrispondono all'identità).

Già presenti (nessun intervento): header sticky, righe zebrate/hover, fade-in
riga 0.2s, micro-animazioni di stato senza loop, bordi stato 3px colorati
(party/suspect/nicked), scrim low-opacity v2.8.4 — confermati dalla review
delle fonti (lhm.gg: animation deve comunicare stato, non ritardarlo).

## Consequences
- Un solo commit CSS (revertibile in 2 righe) + poche classi in rowBuilder.
- La palette, i font e il layout restano invariati: identità v3 preservata.
- Nessuna modifica a `overlay.html` semantico.

## Alternatives
- Redesign radicale (dark dashboard "cyberpunk"): scartato — non drastico
  (D2) e fuori identità.
- Cambio font (es. IBM Plex Sans): scartato — Inter è già la scelta
  raccomandata per HUD densi (fontalternatives).

## Implementation notes
- `renderer/overlay.css`: blocchi "Numeric columns (v4.1)" e "Keyboard focus".
- `renderer/ts/table/rowBuilder.ts`: classe `num` sulle celle numeriche.
- Setting: `.settings-form-row` margin 8px + `:last-child` 0.

## Validation
Screenshot before/after in `artifacts/screens-before/` vs `artifacts/screens/`
(replay `2026-07-31-1`): allineamento numerico visibile e leggibilità
migliorata, nessuna regressione negli altri stati (dropdown, settings,
compact, low-opacity); vision review verde.
