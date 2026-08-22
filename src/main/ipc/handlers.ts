/**
 * IPC handler registration — same channel set as v3 (contract in
 * src/shared/ipc-contract.ts). Reads/writes only via shared state modules.
 */

import { dialog, ipcMain, type BrowserWindow } from 'electron';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { IPC_CHANNELS } from '../../shared/ipc-contract';
import { cache } from '../api/cache';
import type { ConfigStore, AppConfig } from '../config';
import type { LogWatcher } from '../log/logWatcher';
import type { PartyState } from '../state';
import { lookup, type LookupDeps } from './lookup';

const MAX_LOG_LINES = 100;
const recentLogLines: string[] = [];

export function pushLogLine(line: string): void {
    recentLogLines.push(line);
    if (recentLogLines.length > MAX_LOG_LINES) recentLogLines.shift();
}

export interface HandlerDeps extends LookupDeps {
    getOverlayWin: () => BrowserWindow | null;
    updateAlwaysOnTop: (store: ConfigStore) => void;
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
    const { store, getOverlayWin, updateAlwaysOnTop, registerHotkeys, logWatcher } = deps;

    const broadcastConfig = () => getOverlayWin()?.webContents.send('config:updated', store.getAll());

    ipcMain.handle(IPC_CHANNELS.LOOKUP_PLAYER, (_e, username: string, interval: string | null, mode: string | null) =>
        lookup(username, 'manual', interval, mode, deps));

    ipcMain.handle(IPC_CHANNELS.LOOKUP_BULK, async (_e, names: string[], interval: string | null, mode: string | null) => {
        const results = [];
        for (const name of names) {
            results.push(await lookup(name, 'bulk', interval, mode, deps));
        }
        return results;
    });

    ipcMain.handle(IPC_CHANNELS.STATS_SET_INTERVAL, (_e, interval: string) => {
        store.set('statsInterval', interval);
        broadcastConfig();
    });

    ipcMain.handle(IPC_CHANNELS.STATS_SET_MODE, (_e, mode: string) => {
        store.set('statsMode', mode);
        broadcastConfig();
    });

    ipcMain.handle(IPC_CHANNELS.STATS_REFETCH_ALL, async (_e, names: string[], interval: string, mode: string | null) => {
        store.set('statsInterval', interval);
        if (mode) store.set('statsMode', mode);
        deps.registry.clear();
        const results = [];
        for (const name of names) {
            results.push(await lookup(name, 'manual', interval, mode, deps));
        }
        return results;
    });

    ipcMain.handle(IPC_CHANNELS.PLAYERS_CLEAR, () => {
        // Party members are pinned — preserve them across manual clears.
        const removed = deps.registry.clearExcept(new Set(deps.party.snapshot()));
        cache.clear();
        for (const key of removed) getOverlayWin()?.webContents.send('player:remove', key);
        getOverlayWin()?.webContents.send('players:clear');
    });

    ipcMain.handle(IPC_CHANNELS.SETTINGS_OPEN, () => {
        getOverlayWin()?.webContents.send('settings:show');
    });
    ipcMain.handle(IPC_CHANNELS.SETTINGS_CLOSE, () => {
        // handled inline in the overlay window
    });
    ipcMain.handle(IPC_CHANNELS.OVERLAY_CLOSE, () => getOverlayWin()?.hide());
    ipcMain.handle(IPC_CHANNELS.OVERLAY_MINIMIZE, () => getOverlayWin()?.minimize());

    ipcMain.handle(IPC_CHANNELS.CONFIG_GET, (_e, key: string) => store.get(key as keyof AppConfig));
    ipcMain.handle(IPC_CHANNELS.CONFIG_GET_ALL, () => store.getAll());

    ipcMain.handle(IPC_CHANNELS.CONFIG_SET, (_e, key: string, value: unknown) => {
        store.set(key as keyof AppConfig, value);
        broadcastConfig();
    });

    ipcMain.handle(IPC_CHANNELS.CONFIG_SAVE, (_e, cfg: Record<string, unknown>) => {
        store.setMany(cfg);

        // Restart watcher if log path changed
        logWatcher.stop();
        // When nicked, use the nick name for log detection (that's what appears in chat)
        const watcherName = store.get('isNicked') && store.get('myNickName')
            ? store.get('myNickName')
            : store.get('myUsername');
        logWatcher.start(store.get('logPath'), watcherName);

        // Update overlay window properties
        updateAlwaysOnTop(store);

        // Re-register hotkeys in case they changed
        registerHotkeys();

        // Notify overlay window
        broadcastConfig();
    });

    ipcMain.handle(IPC_CHANNELS.BROWSE_LOG_FILE, async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            title: 'Select the Minecraft latest.log file',
            defaultPath: defaultLogFolder(),
            filters: [{ name: 'Log files', extensions: ['log'] }],
        });
        return canceled ? null : filePaths[0];
    });

    ipcMain.handle(IPC_CHANNELS.TEST_LOG_PATH, (_e, p: string) => fs.existsSync(p));
    ipcMain.handle(IPC_CHANNELS.DEBUG_LOG_LINES, () => [...recentLogLines]);
}
