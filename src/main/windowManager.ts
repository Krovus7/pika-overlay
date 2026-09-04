/**
 * Overlay window management — ported from pika-overlay-v3/src/windowManager.js.
 * The separate settings window is gone (D9): the settings panel is inline.
 */

import { BrowserWindow } from 'electron';
import * as path from 'node:path';

import type { ConfigStore } from './config';

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
        type: 'toolbar',
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

    const saveBounds = () => {
        if (!overlayWin) return;
        store.set('overlayBounds', overlayWin.getBounds());
    };

    overlayWin.on('moved', saveBounds);
    overlayWin.on('resized', saveBounds);
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
