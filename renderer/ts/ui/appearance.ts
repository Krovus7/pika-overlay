/** Applies the visual parts of the config (layout, density, opacity) to the DOM. */

import { state } from '../core/state';
import { applyOpacity } from './lowOpacity';

const btnToggleView = document.getElementById('btn-toggle-view') as HTMLButtonElement;

export function applyLayoutClass(): void {
    const compact = state.layout === 'compact';
    document.body.classList.toggle('layout-compact', compact);
    btnToggleView.classList.toggle('is-on', compact);
    btnToggleView.title = compact ? 'Switch to Detailed layout' : 'Switch to Compact layout';
}

export function applyAppearance(cfg: Record<string, unknown>): void {
    applyLayoutClass();
    document.body.classList.toggle('density-dense', cfg.rowDensity === 'dense');
    if (typeof cfg.opacity === 'number') applyOpacity(cfg.opacity);
}
