/**
 * IPC handler registration (contract in src/shared/ipc-contract.ts).
 * Reads/writes only via shared state modules; config and API-health channels
 * live in configHandlers.ts / apiHandlers.ts.
 */

import { dialog, ipcMain, type BrowserWindow } from 'electron';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { IPC_CHANNELS, IPC_EVENTS } from '../../shared/ipc-contract';
import { cache } from '../api/cache';
import type { ConfigStore } from '../config';
import type { LogWatcher } from '../log/logWatcher';
import { getRecentLogLines } from '../log/debugLines';
import type { LookupQueue, PartyState } from '../state';
import { checkForUpdates, downloadAndApply, getUpdateState } from '../update/velopackUpdate';
import { registerApiHandlers } from './apiHandlers';
import { clearPlayers } from './clearPlayers';
import { broadcastConfig, registerConfigHandlers } from './configHandlers';
import type { LookupDeps, LookupService } from './lookup';

export interface HandlerDeps extends LookupDeps {
    getOverlayWin: () => BrowserWindow | null;
    service: LookupService;
    queue: LookupQueue;
    /** Applies always-on-top and zoom from the config to the overlay window */
    applyWindowConfig: (store: ConfigStore) => void;
    registerHotkeys: () => void;
    logWatcher: LogWatcher;
    party: PartyState;
}

function defaultLogFolder(): string {
    const base = process.platform === 'win32'
        ? path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft')
        : process.platform === 'darwin'
            ? path.join(os.homedir(), 'Library', 'Application Support', 'minecraft')
            : path.join(os.homedir(), '.minecraft');
    return path.join(base, 'logs');
}

export function registerIpcHandlers(deps: HandlerDeps): void {
    const { store, getOverlayWin, service, queue } = deps;

    // Renderer input is checked here: a malformed call is ignored, never thrown on.
    ipcMain.handle(IPC_CHANNELS.LOOKUP_PLAYER, (_e, username: unknown, interval: string | null, mode: string | null) =>
        (typeof username === 'string' ? service.lookup(username, 'manual', interval, mode) : null));

    ipcMain.handle(IPC_CHANNELS.LOOKUP_BULK, (_e, names: unknown, interval: string | null, mode: string | null) => {
        const usernames = Array.isArray(names) ? names.filter((n): n is string => typeof n === 'string') : [];
        for (const username of usernames) queue.enqueue({ username, source: 'bulk', interval, mode });
        return usernames.length;
    });

    ipcMain.handle(IPC_CHANNELS.LOOKUP_RETRY, async (_e, username: unknown) => {
        if (typeof username === 'string') await service.retry(username);
    });

    ipcMain.handle(IPC_CHANNELS.STATS_SET_INTERVAL, (_e, interval: string) => {
        store.set('statsInterval', interval);
        broadcastConfig(deps);
    });

    ipcMain.handle(IPC_CHANNELS.STATS_SET_MODE, (_e, mode: string) => {
        store.set('statsMode', mode);
        broadcastConfig(deps);
    });

    ipcMain.handle(IPC_CHANNELS.STATS_REFETCH_ALL, (_e, interval: string, mode: string | null) => {
        store.set('statsInterval', interval);
        if (mode) store.set('statsMode', mode);
        service.refreshAll(queue, store.get('statsInterval'), store.get('statsMode'));
    });

    ipcMain.handle(IPC_CHANNELS.PLAYERS_CLEAR, () => clearPlayers({
        registry: deps.registry,
        party: deps.party,
        queue,
        send: (channel, ...args) => getOverlayWin()?.webContents.send(channel, ...args),
    }));

    // "Refresh" button: nothing cached is trusted, every shown row is fetched again
    ipcMain.handle(IPC_CHANNELS.PLAYERS_REFRESH, () => {
        cache.clear();
        service.refreshAll(queue, null, null);
    });

    ipcMain.handle(IPC_CHANNELS.SETTINGS_OPEN, () => {
        getOverlayWin()?.webContents.send(IPC_EVENTS.SETTINGS_SHOW);
    });
    ipcMain.handle(IPC_CHANNELS.SETTINGS_CLOSE, () => {
        // handled inline in the overlay window
    });
    ipcMain.handle(IPC_CHANNELS.OVERLAY_CLOSE, () => getOverlayWin()?.hide());
    ipcMain.handle(IPC_CHANNELS.OVERLAY_MINIMIZE, () => getOverlayWin()?.minimize());

    ipcMain.handle(IPC_CHANNELS.BROWSE_LOG_FILE, async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            title: 'Select the Minecraft latest.log file',
            defaultPath: defaultLogFolder(),
            filters: [{ name: 'Log files', extensions: ['log'] }],
        });
        return canceled ? null : filePaths[0];
    });

    ipcMain.handle(IPC_CHANNELS.TEST_LOG_PATH, (_e, p: unknown) => typeof p === 'string' && fs.existsSync(p));
    ipcMain.handle(IPC_CHANNELS.DEBUG_LOG_LINES, () => getRecentLogLines());

    // ─── Auto-update (Velopack) ─────────────────────────────────────────────
    ipcMain.handle(IPC_CHANNELS.UPDATE_GET_STATE, () => getUpdateState());
    ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, () => checkForUpdates());
    ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD_APPLY, () => downloadAndApply());

    registerConfigHandlers(deps);
    registerApiHandlers(deps);
}
