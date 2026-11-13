/**
 * API health + key-test IPC, and the health broadcast to the overlay.
 */

import { ipcMain } from 'electron';

import { IPC_CHANNELS, IPC_EVENTS } from '../../shared/ipc-contract';
import { confirmApiKey } from '../api/apiSession';
import { getHealth, onHealthChange } from '../api/health';
import { testApiKey } from '../api/keyTest';
import type { HandlerDeps } from './handlers';

export function registerApiHandlers(deps: Pick<HandlerDeps, 'getOverlayWin' | 'service' | 'queue'>): void {
    onHealthChange(h => deps.getOverlayWin()?.webContents.send(IPC_EVENTS.API_HEALTH, h));

    ipcMain.handle(IPC_CHANNELS.API_GET_HEALTH, () => getHealth());
    ipcMain.handle(IPC_CHANNELS.API_TEST_KEY, async (_e, key: unknown) => {
        const tested = typeof key === 'string' ? key : '';
        const result = await testApiKey(tested);
        if (result.ok && confirmApiKey(tested)) deps.service.refreshAll(deps.queue, null, null);
        return result;
    });
}
