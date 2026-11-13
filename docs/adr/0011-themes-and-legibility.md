# ADR-0011 — Dark and light themes, continuous legibility floor (v5)

**Status:** Accepted

## Context
The overlay is drawn over a game, so what is behind it is not under our
control. Players use bright or dark texture packs and backgrounds, and many
lower the overlay opacity so they can see the game through it. Legibility was
the top requirement from the owner.

The v4 answer was a switcher that only existed at low opacity: below 15 %
background opacity a moon/sun button appeared (`lo-dark` / `lo-light`) and the
choice lived in `localStorage` (`loMode`). Problems:

1. Between 100 % and 15 % there was no choice at all: a bright scene behind a
   navy panel at 40 % opacity was readable only by luck.
2. At the switch point legibility jumped instead of changing smoothly.
3. The two modes were text-color overrides on top of one navy design, not two
   themes; stylesheets mixed hard-coded whites, blacks and navy values.
4. The choice was not part of the config, so it was not saved with the rest.

## Decision
- Two real themes, **dark** (navy panels, light text) and **light** (light
  panels, dark text), behind one token contract in `renderer/css/tokens.css`.
  The theme is the `data-theme` attribute on `<html>`, set from the config key
  `theme` (`dark` | `light`, default `dark`).
- The theme is selectable at any opacity (Settings → Appearance, title-bar
  toggle).
- A **continuous legibility floor** replaces the low-opacity switch: one
  variable `--lo` (0 = no help needed, 1 = maximum), derived from the
  background opacity, drives every legibility aid smoothly.
- Opacity affects backgrounds only, never text.

## Consequences
- Both common game backgrounds have a theme that suits them, at every
  opacity; there is no threshold where the look jumps.
- Every stylesheet must use the semantic tokens (`--panel-rgb`, `--surface-rgb`,
  `--ink-rgb`, `--halo-rgb`, `--text*`, `*-text` variants); a hard-coded white,
  black or navy breaks one theme. No file other than `tokens.css` contains
  such values at the time of writing.
- User tier colors (hex values chosen for the dark theme) are lightness-capped
  in the light theme, so a user color is shown with the same hue and chroma but
  a different lightness there.
- At very low opacity the overlay is no longer a single flat panel: rows become
  separate strips with their own backing. This is intended, and costs some of
  the "one window" look.
- Light theme over a dark scene needs more backing than dark over dark, so its
  scrim ceiling is higher (0.86 vs 0.72).
- The legibility result depends on real game scenes; it is checked on
  synthetic backdrops (see Validation), not yet in the game.

## Alternatives
- Keep the v4 switcher and make it available at all opacities: rejected — it
  is still a text-color override, and the stylesheets would keep their
  hard-coded values.
- Automatic theme from the pixels behind the window: rejected — Electron gives
  no cheap access to what is behind a transparent window, and a flickering
  theme during play is worse than a manual choice.
- A fixed minimum opacity: rejected — users asked for low opacity; the floor
  is applied to the backing, not to the setting.
- Text outline only: rejected — an outline alone does not separate small
  numbers from a busy background; it is used as part of the floor, together
  with the row backing.

## Implementation notes
- Tokens and themes: `renderer/css/tokens.css`. Neutral surfaces are RGB
  triplets so alpha is applied where used:
  `background: rgba(var(--panel-rgb), var(--bg-alpha))`. The light theme is
  `:root[data-theme="light"]`.
- Theme application: `renderer/ts/ui/theme.ts` (`setThemeDom`,
  `applyThemeFromConfig`, title-bar toggle writing `theme` through
  `config:set`). A v4 `loMode = 'light'` in `localStorage` is migrated once
  into `theme: 'light'` and removed.
- Legibility need: `renderer/ts/ui/lowOpacity.ts`.
  `legibilityNeed(alpha) = clamp((0.75 − alpha) / (0.75 − 0.05), 0, 1)`: 0 at
  75 % opacity and above, 1 at 5 % (the minimum the config allows,
  `src/main/config.ts`). `applyOpacity` writes `--bg-alpha` and `--lo` on
  `<html>`; the same function runs from `config:updated` and the demo helper.
- What `--lo` drives (all in CSS, continuous):
  - `--scrim-a = --lo × --scrim-max` — extra panel-colored backing behind each
    row (`table.css`, `footer.css`); `--scrim-max` is 0.72 (dark) / 0.86
    (light).
  - `--halo` — three-layer text shadow in the opposite color of the text,
    applied from `base.css`; strength scales with `--lo`.
  - `#stats-table` `border-spacing: 0 calc(var(--lo) × 2px)` and row-end corner
    radius `--lo × 5px` — rows detach into strips.
  - Row meaning tints (self, party, suspect, nicked) gain `--lo × 0.08`
    (nicked `× 0.12`) alpha.
  - `--text-dim` / `--text-muted` are `color-mix`ed toward the primary text
    color as `--lo` rises.
  - Window border alpha gains `--lo × 0.12`.
- Chrome that must stay readable regardless of the setting keeps a floor:
  title bar `max(0.8, --bg-alpha)` (`--chrome-a`); search bar, footer and
  banner `max(0.78, --bg-alpha × 0.9)` (`--chrome-a-soft`); table header cells
  `max(0.94, --bg-alpha)`.
- Light theme tier colors: `.tiered` uses
  `oklch(from var(--tier) min(l, var(--tier-l-max)) min(c, 0.2) h)` with
  `--tier-l-max: 0.46` (`table.css`, `tokens.css`).
- Config key `theme` is validated in `normalizeConfig`; unknown values fall
  back to `dark`. Bundled font and its OFL license: `renderer/fonts/`.
- Review helpers: `window.__pikaDemoTheme`, `__pikaDemoOpacity`,
  `__pikaDemoBackdrop('bright' | 'dark')` (`renderer/ts/demo/`), driven by
  `PIKA_SHOTS=1` (`src/main/devShots.ts`).

## Validation
- `tests/config.test.ts` covers the `theme` key validation and default. The
  CSS and `legibilityNeed` have no automated test.
- Code-verified (2026-11-13): `PIKA_SHOTS=1` screenshot run, 48 screenshots
  reviewed by eye — both themes, opacity ladder 100 / 50 / 20 / 5 %, low
  opacity over a synthetic bright and a synthetic dark backdrop for both
  themes (`docs/VERIFICATION-2026-11.md`).
- Not field-verified: legibility over the real game and real texture packs.
  Open item for Gate B; if it fails there, the numbers to tune are
  `LO_NO_HELP_ALPHA`, `--scrim-max` and the `--halo` weights.
