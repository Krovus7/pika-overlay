/**
 * Overlay window management — ported from pika-overlay-v3/src/windowManager.js.
 * The separate settings window is gone (D9): the settings panel is inline.
 */

import { BrowserWindow } from 'electron';
import * as path from 'node:path';

import type { ConfigStore } from './config';

const BOUNDS_SAVE_DEBOUNCE_MS = 400;

let overlayWin: BrowserWindow | null = null;

export function getOverlayWin(): BrowserWindow | null {
    return overlayWin;
}

export function createOverlay(store: ConfigStore, rootDir: string): BrowserWindow {
    if (overlayWin) return overlayWin;

    const bounds = store.get('overlayBounds') || { x: 20, y: 60, width: 960, height: 600 };
    const iconPath = path.join(rootDir, 'assets', 'icon.png');
    const preloadPath = path.join(rootDir, 'dist', 'src', 'preload.bundle.js');
    const htmlPath = path.join(rootDir, 'renderer', 'overlay.html');

    overlayWin = new BrowserWindow({
        ...bounds,
        transparent: true,
        frame: false,
        icon: iconPath,
        alwaysOnTop: store.get('alwaysOnTop'),
        // A normal window (not a 'toolbar' one): it has a taskbar button while
        // shown. The close button hides it, which leaves only the tray icon.
        skipTaskbar: false,
        resizable: true,
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    overlayWin.loadFile(htmlPath);

    if (store.get('alwaysOnTop')) {
        overlayWin.setAlwaysOnTop(true, 'screen-saver');
        overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }

    // moved/resized fire continuously while dragging — persist once it settles
    let boundsTimer: NodeJS.Timeout | null = null;
    const saveBounds = () => {
        if (boundsTimer) clearTimeout(boundsTimer);
        boundsTimer = null;
        if (!overlayWin || overlayWin.isDestroyed()) return;
        store.set('overlayBounds', overlayWin.getBounds());
    };
    const saveBoundsDebounced = () => {
        if (boundsTimer) clearTimeout(boundsTimer);
        boundsTimer = setTimeout(saveBounds, BOUNDS_SAVE_DEBOUNCE_MS);
    };

    overlayWin.on('moved', saveBoundsDebounced);
    overlayWin.on('resized', saveBoundsDebounced);
    overlayWin.on('close', saveBounds);
    overlayWin.webContents.on('did-finish-load', () => applyUiScale(store));
    overlayWin.on('closed', () => { overlayWin = null; });

    return overlayWin;
}

export function updateAlwaysOnTop(store: ConfigStore): void {
    if (!overlayWin) return;
    const aot = store.get('alwaysOnTop');
    if (aot) {
        overlayWin.setAlwaysOnTop(true, 'screen-saver');
        overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } else {
        overlayWin.setAlwaysOnTop(false);
        overlayWin.setVisibleOnAllWorkspaces(false);
    }
}

/** Zoom is applied once the page has loaded and again on every config change */
export function applyUiScale(store: ConfigStore): void {
    if (!overlayWin || overlayWin.isDestroyed()) return;
    overlayWin.webContents.setZoomFactor(store.get('uiScale'));
}

export function applyWindowConfig(store: ConfigStore): void {
    updateAlwaysOnTop(store);
    applyUiScale(store);
}
