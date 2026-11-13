/** Applies the visual parts of the config (layout, density, opacity, theme) to the DOM. */

import type { PikaOverlayApi } from '../../../src/shared/preload-api';
import { state } from '../core/state';
import { applyOpacity } from './lowOpacity';
import { applyThemeFromConfig } from './theme';

const btnToggleView = document.getElementById('btn-toggle-view') as HTMLButtonElement;

export function applyLayoutClass(): void {
    const compact = state.layout === 'compact';
    document.body.classList.toggle('layout-compact', compact);
    btnToggleView.classList.toggle('is-on', compact);
    btnToggleView.title = compact ? 'Switch to Detailed layout' : 'Switch to Compact layout';
}

export function applyAppearance(cfg: Record<string, unknown>, api: PikaOverlayApi): void {
    applyLayoutClass();
    applyThemeFromConfig(cfg, api);
    document.body.classList.toggle('density-dense', cfg.rowDensity === 'dense');
    if (typeof cfg.opacity === 'number') applyOpacity(cfg.opacity);
}
