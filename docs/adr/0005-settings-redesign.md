# ADR-0005 — Redesign del pannello Impostazioni, overlay graficamente invariato

**Status:** Accepted

## Context
Il piano v4 (D2/D3): la grafica dell'overlay (tabella, titlebar, search bar,
footer) resta **invariata** — HTML/CSS copiati da v3 senza modifiche visive.
Unico restyling consentito: il pannello Impostazioni inline (tab più chiare,
stato di salvataggio, sezione "Aggiornamenti").

## Decision
`renderer/overlay.html` e `renderer/overlay.css` sono copiati 1:1 da v3.
Il pannello Impostazioni (sezione `#settings-panel` in overlay.html + stili
correlati) viene ridisegnato: struttura a tab rivista, feedback di salvataggio,
nuova sezione Aggiornamenti. La persistenza config resta la stessa, con sole
chiavi nuove `update*` (ADR-0007).

## Consequences
- Zero regressioni visive sull'overlay; il restyling è confinato a un'area.
- I selettori CSS del pannello (`.settings-*`) possono cambiare liberamente.

## Alternatives
- Finestra settings separata (v2): rimossa in v3 e non ripristinata (D9).
- Overlay ridisegnato: fuori scope (D2).

## Implementation notes
- Il pannello resta inline in `overlay.html` (nessuna finestra separata).
- Gli stili del pannello restano in `overlay.css` (dove sono già in v3) o in un
  `settings-panel.css` importato; la scelta segue la struttura finale.
- I bundle renderer (esbuild) sostituiscono i tre `<script>` di v3 con uno solo.

## Validation
Diff visivo overlay v3 vs v4 identico (screenshot/checklist); pannello
Impostazioni con tab, stato salvataggio e sezione Aggiornamenti funzionanti.
