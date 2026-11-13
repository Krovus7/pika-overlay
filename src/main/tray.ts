/**
 * System tray — ported from pika-overlay-v3/src/main.js `createTray`.
 */

import { app, Menu, Tray, type BrowserWindow } from 'electron';
import * as path from 'node:path';

import { IPC_EVENTS } from '../shared/ipc-contract';
import pkg from '../../package.json';

let tray: Tray | null = null;

export function createTray(rootDir: string, getOverlayWin: () => BrowserWindow | null): void {
    // The .ico carries hand-simplified 16-32 px images; a scaled-down PNG turns to mush in the tray.
    const iconPath = path.join(rootDir, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
    const label = `Pika Overlay v${pkg.version}`;

    tray = new Tray(iconPath);
    tray.setContextMenu(Menu.buildFromTemplate([
        { label, enabled: false },
        { type: 'separator' },
        { label: 'Show Overlay', click: () => getOverlayWin()?.show() },
        { label: 'Settings', click: () => {
            const win = getOverlayWin();
            if (win) {
                win.show();
                win.webContents.send(IPC_EVENTS.SETTINGS_SHOW);
            }
        } },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() },
    ]));
    tray.setToolTip(`Pika-Network BedWars Overlay v${pkg.version}`);
    tray.on('click', () => getOverlayWin()?.show());
}
