/**
 * API health + key-test IPC, and the health broadcast to the overlay.
 */

import { ipcMain } from 'electron';

import { IPC_CHANNELS, IPC_EVENTS } from '../../shared/ipc-contract';
import { getHealth, onHealthChange } from '../api/health';
import { testApiKey } from '../api/keyTest';
import type { HandlerDeps } from './handlers';

export function registerApiHandlers(deps: Pick<HandlerDeps, 'getOverlayWin'>): void {
    onHealthChange(h => deps.getOverlayWin()?.webContents.send(IPC_EVENTS.API_HEALTH, h));

    ipcMain.handle(IPC_CHANNELS.API_GET_HEALTH, () => getHealth());
    ipcMain.handle(IPC_CHANNELS.API_TEST_KEY, (_e, key: string) => testApiKey(String(key ?? '')));
}
