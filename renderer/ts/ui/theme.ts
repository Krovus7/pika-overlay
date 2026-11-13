/** Dark/light theme: `data-theme` on <html>, the title bar toggle, and the one-time legacy migration. */

import type { PikaOverlayApi } from '../../../src/shared/preload-api';
import { setUseIcon } from './icons';

export type Theme = 'dark' | 'light';

const toggleBtn = document.getElementById('btn-theme') as HTMLButtonElement;
const toggleIcon = document.getElementById('theme-icon') as Element;

export function currentTheme(): Theme {
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** DOM only: callers decide whether to persist. */
export function setThemeDom(theme: Theme): void {
    document.documentElement.dataset.theme = theme;
    // The button shows the theme it switches to
    setUseIcon(toggleIcon, theme === 'dark' ? 'sun' : 'moon');
    toggleBtn.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
}

/** v4 stored a low-opacity "light text" choice in localStorage; carry it over once. */
function legacyLightChoice(): boolean {
    try {
        const stored = localStorage.getItem('loMode');
        if (stored === null) return false;
        localStorage.removeItem('loMode');
        return stored === 'light';
    } catch (err) {
        console.warn('[Overlay] localStorage unavailable:', String(err));
        return false;
    }
}

export function applyThemeFromConfig(cfg: Record<string, unknown>, api: PikaOverlayApi): void {
    if (cfg.theme !== 'dark' && cfg.theme !== 'light') return;
    if (cfg.theme === 'dark' && legacyLightChoice()) {
        setThemeDom('light');
        api.setConfig('theme', 'light').catch(err => console.error('[Overlay] Saving migrated theme failed:', String(err)));
        return;
    }
    setThemeDom(cfg.theme);
}

export function initThemeToggle(api: PikaOverlayApi): void {
    toggleBtn.addEventListener('click', () => {
        const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
        setThemeDom(next);
        api.setConfig('theme', next).catch(err => console.error('[Overlay] Saving theme failed:', String(err)));
    });
}
