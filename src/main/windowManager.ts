/**
 * Overlay window management — ported from pika-overlay-v3/src/windowManager.js.
 * The settings window lives in settingsWindow.ts (ADR-0013).
 */

import { BrowserWindow, screen } from 'electron';
import * as path from 'node:path';

import type { ConfigStore } from './config';
import type { Rect } from './windowBounds';
import { boundsForLayout, scaleSizes, withSize, type LayoutMode } from './layoutSizes';
import { overlayMinSize, scaleBounds } from './windowBounds';

const BOUNDS_SAVE_DEBOUNCE_MS = 400;

let overlayWin: BrowserWindow | null = null;

/** Saves the window bounds and remembers their size for the current layout */
function saveOverlayBounds(store: ConfigStore, bounds: Rect): void {
    store.set('overlayBounds', bounds);
    store.set('overlaySizes', withSize(store.get('overlaySizes'), store.get('overlayMode'), bounds));
}

export function getOverlayWin(): BrowserWindow | null {
    return overlayWin;
}

export function createOverlay(store: ConfigStore, rootDir: string): BrowserWindow {
    if (overlayWin) return overlayWin;

    const bounds = store.get('overlayBounds') || { x: 20, y: 60, width: 960, height: 600 };
    const minSize = overlayMinSize(store.get('uiScale'));
    const iconPath = path.join(rootDir, 'assets', 'icon.png');
    const preloadPath = path.join(rootDir, 'dist', 'src', 'preload.bundle.js');
    const htmlPath = path.join(rootDir, 'renderer', 'overlay.html');

    overlayWin = new BrowserWindow({
        ...bounds,
        minWidth: minSize.width,
        minHeight: minSize.height,
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
        saveOverlayBounds(store, overlayWin.getBounds());
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

/** A new interface scale resizes the window by the same ratio and saves the result. */
export function resizeForScale(store: ConfigStore, oldScale: number, newScale: number): void {
    if (!overlayWin || overlayWin.isDestroyed()) return;
    const current = overlayWin.getBounds();
    const workArea = screen.getDisplayMatching(current).workArea;
    const min = overlayMinSize(newScale);
    overlayWin.setMinimumSize(min.width, min.height);
    const next = scaleBounds(current, oldScale, newScale, workArea);
    overlayWin.setBounds(next);
    store.set('overlayBounds', next);
    store.set('overlaySizes', scaleSizes(store.get('overlaySizes'), oldScale, newScale));
}

/**
 * The layout changed (the store already holds the new mode): remember the size
 * the old layout had, then restore the new layout's size if it has one.
 */
export function switchLayoutSize(store: ConfigStore, oldMode: LayoutMode): void {
    if (!overlayWin || overlayWin.isDestroyed()) return;
    const current = overlayWin.getBounds();
    store.set('overlaySizes', withSize(store.get('overlaySizes'), oldMode, current));
    const saved = store.get('overlaySizes')[store.get('overlayMode')];
    const workArea = screen.getDisplayMatching(current).workArea;
    const next = boundsForLayout(current, saved, store.get('uiScale'), workArea);
    if (!next) return;
    overlayWin.setBounds(next);
    saveOverlayBounds(store, next);
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
