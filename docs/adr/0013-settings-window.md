# ADR-0013 — Settings in their own window (v5)

**Status:** Accepted (supersedes the "inline panel" decision of ADR-0005)

## Context
Since v4 the settings were a panel inside the overlay window (ADR-0005: "the
panel stays inline in `overlay.html`, no separate window"). While it is open
it covers the table, so a change of colors, opacity, density or columns cannot
be judged against the overlay it changes; the owner had to close and reopen it.
The overlay window is also transparent and frameless, which makes a large form
inside it awkward (scrollbars over a see-through background).

## Decision
Settings open in a separate, opaque, frameless window with its own title bar.
There is one instance; opening it again focuses it. Every config save is
already broadcast as `config:updated`, now to both windows, so each change is
visible on the overlay at once. Dragging the background-opacity slider and the
color pickers saves at most every 120 ms for a live preview.

## Consequences
- The overlay stays visible and usable while settings are open.
- A second renderer bundle (`settings.js`) and page (`settings.html`); the tab
  modules are unchanged. The overlay bundle no longer contains settings code.
- Events that both windows need (`config:updated`, `api:health`,
  `update:state`) go through `broadcast()`; player/table/game events stay
  overlay-only.
- The "Preview with sample players" button cannot call the overlay's demo
  helpers directly any more; it goes through a main-process relay
  (`overlay:demo`).
- The window is a normal top-level window: when the overlay is always-on-top,
  the settings window uses the same level (`screen-saver`) so it is usable over
  the game.

## Alternatives
- Keep the inline panel and make it narrower: rejected, it still hides part of
  the table and cannot sit beside it.
- A `BrowserWindow` child of the overlay (`parent`): rejected, a child is
  minimized and closed with the parent and cannot be placed freely.

## Implementation notes
- `src/main/settingsWindow.ts` (`openSettings(tab?)`, `getSettingsWin()`,
  placement and zoom), `src/main/broadcast.ts`, pure geometry in
  `src/main/windowBounds.ts` (`placeBeside`, `isInsideAny`, `scaleBounds`).
- Config key `settingsBounds` (null by default, validated like
  `overlayBounds`); reused only when still inside a display's work area,
  otherwise placed beside the overlay (right, else left, else centered).
- IPC: `settings:open` (optional validated tab id), `settings:close`,
  `settings:minimize`, `overlay:demo`; event `settings:tab` (switch tab of an
  open window). The `settings:show` event is gone.
- Renderer: `renderer/settings.html`, `renderer/ts/settingsWindow.ts` (entry),
  `renderer/ts/settings/index.ts` (shell), `saveQueue.saveThrottled`.
- Tooling: `scripts/lib/cdp.mjs` `app.page('settings.html')`, smoke and
  update-cycle drive the window; the screenshot driver captures it.

## Validation
- `tests/windowBounds.test.ts` (placement, clamping), `tests/config.test.ts`
  (`settingsBounds`).
- `node scripts/smoke.mjs`: the window opens, renders, closes; the overlay page
  is untouched.
- Dev app over CDP: a second page target appears, an opacity drag in settings
  changes the overlay's `--bg-alpha` within a second, Escape closes it.
