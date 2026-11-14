/**
 * The settings window (ADR-0013): one frameless, opaque window next to the
 * overlay so every change is visible on the overlay at once.
 */

import { BrowserWindow, screen } from 'electron';
import * as path from 'node:path';

import { IPC_EVENTS, SETTINGS_TAB_IDS } from '../shared/ipc-contract';
import type { ConfigStore } from './config';
import { isInsideAny, placeBeside } from './windowBounds';

const DEFAULT_SIZE = { width: 760, height: 680 };
const MIN_SIZE = { width: 560, height: 420 };
const BOUNDS_SAVE_DEBOUNCE_MS = 400;
// Same as --surface-rgb in tokens.css, so the window is never white before first paint
const BACKGROUND = { dark: '#101220', light: '#fcfcff' } as const;

export interface SettingsWindowDeps {
    store: ConfigStore;
    rootDir: string;
    getOverlayWin: () => BrowserWindow | null;
}

let deps: SettingsWindowDeps | null = null;
let settingsWin: BrowserWindow | null = null;

export function initSettingsWindow(d: SettingsWindowDeps): void {
    deps = d;
}

export function getSettingsWin(): BrowserWindow | null {
    return settingsWin && !settingsWin.isDestroyed() ? settingsWin : null;
}

export function isSettingsTab(tab: unknown): tab is string {
    return typeof tab === 'string' && (SETTINGS_TAB_IDS as readonly string[]).includes(tab);
}

function initialBounds({ store, getOverlayWin }: SettingsWindowDeps): Electron.Rectangle {
    const saved = store.get('settingsBounds');
    if (saved && isInsideAny(saved, screen.getAllDisplays().map(d => d.workArea))) return saved;
    const overlay = getOverlayWin()?.getBounds() ?? store.get('overlayBounds');
    return placeBeside(overlay, DEFAULT_SIZE, screen.getDisplayMatching(overlay).workArea);
}

/** Same stacking level as the overlay, so the window is usable over the game. */
function followOverlayLevel(win: BrowserWindow, store: ConfigStore): void {
    if (store.get('alwaysOnTop')) win.setAlwaysOnTop(true, 'screen-saver');
    else win.setAlwaysOnTop(false);
}

function persistBoundsLater(win: BrowserWindow, store: ConfigStore): void {
    let timer: NodeJS.Timeout | null = null;
    const save = (): void => {
        if (timer) clearTimeout(timer);
        timer = null;
        if (!win.isDestroyed() && !win.isMinimized()) store.set('settingsBounds', win.getBounds());
    };
    const later = (): void => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(save, BOUNDS_SAVE_DEBOUNCE_MS);
    };
    win.on('moved', later);
    win.on('resized', later);
    win.on('close', save);
}

function createWindow(d: SettingsWindowDeps, tab: string | undefined): BrowserWindow {
    const { store, rootDir } = d;
    const win = new BrowserWindow({
        ...initialBounds(d),
        minWidth: MIN_SIZE.width,
        minHeight: MIN_SIZE.height,
        show: false,
        frame: false,
        transparent: false,
        backgroundColor: BACKGROUND[store.get('theme')],
        resizable: true,
        icon: path.join(rootDir, 'assets', 'icon.png'),
        webPreferences: {
            preload: path.join(rootDir, 'dist', 'src', 'preload.bundle.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    followOverlayLevel(win, store);
    void win.loadFile(path.join(rootDir, 'renderer', 'settings.html'), { query: tab ? { tab } : {} });
    win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(store.get('uiScale')));
    win.once('ready-to-show', () => win.show());
    persistBoundsLater(win, store);
    win.on('closed', () => { settingsWin = null; });
    return win;
}

/** Opens the window, or focuses it (and switches tab) when it already exists. */
export function openSettings(tab?: string): void {
    if (!deps) return;
    const existing = getSettingsWin();
    if (!existing) {
        settingsWin = createWindow(deps, tab);
        return;
    }
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    if (tab) existing.webContents.send(IPC_EVENTS.SETTINGS_TAB, tab);
}

/** Called on every config save: scale and stacking level follow the overlay's. */
export function applySettingsWindowConfig(store: ConfigStore): void {
    const win = getSettingsWin();
    if (!win) return;
    win.webContents.setZoomFactor(store.get('uiScale'));
    followOverlayLevel(win, store);
}
