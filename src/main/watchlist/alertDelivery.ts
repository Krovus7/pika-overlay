/** Tells the overlay a watched player is in the lobby; blinks the taskbar button when the overlay is not visible. */

import type { BrowserWindow } from 'electron';

import { IPC_EVENTS } from '../../shared/ipc-contract';
import type { WatchAlert, WatchEntry } from '../../shared/watchlist';

export function deliverAlert(win: BrowserWindow | null, name: string, entry: WatchEntry): void {
    if (!win || win.isDestroyed()) return;
    const alert: WatchAlert = { name, kind: entry.kind, note: entry.note };
    win.webContents.send(IPC_EVENTS.WATCHLIST_ALERT, alert);
    if (!win.isVisible() || win.isMinimized()) win.flashFrame(true);
}
