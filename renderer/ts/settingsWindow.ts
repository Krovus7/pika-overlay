/**
 * Entry point of the settings window (renderer/settings.html). Loads the
 * config, keeps it, the API health and the update state in sync with the
 * main process, and handles the window chrome (minimize, close, Escape).
 */

import { state } from './core/state';
import { initSettingsShell } from './settings';
import { flushSaves } from './settings/saveQueue';
import { notifySettingsConfig } from './settings/store';

const api = window.pikaOverlay;

function applyTheme(cfg: Record<string, unknown>): void {
    document.documentElement.dataset.theme = cfg.theme === 'light' ? 'light' : 'dark';
}

function onConfig(cfg: Record<string, unknown>): void {
    applyTheme(cfg);
    notifySettingsConfig(cfg);
}

async function closeWindow(): Promise<void> {
    await flushSaves();
    await api.closeSettings();
}

function bindChrome(): void {
    document.getElementById('btn-settings-minimize')?.addEventListener('click', () => void api.minimizeSettings());
    document.getElementById('btn-settings-close-x')?.addEventListener('click', () => void closeWindow());
    document.addEventListener('keydown', e => { if (e.key === 'Escape') void closeWindow(); });
}

function start(): void {
    const shell = initSettingsShell(api, new URLSearchParams(location.search).get('tab') ?? 'general');
    api.onSettingsTab(shell.select);
    api.onConfigUpdate(onConfig);
    api.onApiHealth(h => { state.health = h; });
    bindChrome();

    api.getApiHealth().then(h => { state.health = h; }).catch(err => console.error('[Settings] Health check failed:', String(err)));
    api.getAllConfig().then(onConfig).catch(err => console.error('[Settings] Loading config failed:', String(err)));
}

if (api) start();
else document.body.textContent = 'Preload failed. Check DevTools.';
