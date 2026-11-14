/** Sends an event to every window that shows config-driven UI: overlay and settings. */

import { getSettingsWin } from './settingsWindow';
import { getOverlayWin } from './windowManager';

export function broadcast(channel: string, ...args: unknown[]): void {
    getOverlayWin()?.webContents.send(channel, ...args);
    getSettingsWin()?.webContents.send(channel, ...args);
}
