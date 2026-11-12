/**
 * Config IPC: config:get/getAll/set/save plus the side effects of a change —
 * API key swap (re-fetch every row), watcher restart (only when its inputs
 * changed), window properties, hotkeys.
 */

import { ipcMain } from 'electron';

import { IPC_CHANNELS, IPC_EVENTS } from '../../shared/ipc-contract';
import { setApiKey } from '../api/apiSession';
import type { AppConfig, ConfigStore } from '../config';
import type { LogWatcher } from '../log/logWatcher';
import type { HandlerDeps } from './handlers';

export function broadcastConfig(deps: Pick<HandlerDeps, 'store' | 'getOverlayWin'>): void {
    deps.getOverlayWin()?.webContents.send(IPC_EVENTS.CONFIG_UPDATED, deps.store.getAll());
}

/** When nicked, the watcher looks for the nick name (that is what chat shows) */
export function watcherSettings(store: ConfigStore): { logPath: string; name: string } {
    const name = store.get('isNicked') && store.get('myNickName')
        ? store.get('myNickName')
        : store.get('myUsername');
    return { logPath: store.get('logPath'), name };
}

export function restartWatcherIfChanged(
    logWatcher: Pick<LogWatcher, 'stop' | 'start'>,
    before: { logPath: string; name: string },
    store: ConfigStore,
): boolean {
    const after = watcherSettings(store);
    if (after.logPath === before.logPath && after.name === before.name) return false;
    logWatcher.stop();
    logWatcher.start(after.logPath, after.name);
    return true;
}

export function registerConfigHandlers(deps: HandlerDeps): void {
    const { store, logWatcher, service, queue } = deps;

    /** Applies a store mutation and the API-key side effect shared by set/save */
    const mutate = (change: () => void): void => {
        const keyBefore = store.get('apiKey');
        change();
        const key = store.get('apiKey');
        if (key !== keyBefore) {
            setApiKey(key);
            service.refreshAll(queue, null, null);
        }
        deps.applyWindowConfig(store);
        broadcastConfig(deps);
    };

    ipcMain.handle(IPC_CHANNELS.CONFIG_GET, (_e, key: string) => store.get(key as keyof AppConfig));
    ipcMain.handle(IPC_CHANNELS.CONFIG_GET_ALL, () => store.getAll());

    ipcMain.handle(IPC_CHANNELS.CONFIG_SET, (_e, key: string, value: unknown) => {
        mutate(() => store.set(key as keyof AppConfig, value));
    });

    ipcMain.handle(IPC_CHANNELS.CONFIG_SAVE, (_e, cfg: Record<string, unknown>) => {
        const watcherBefore = watcherSettings(store);
        mutate(() => store.setMany(cfg));
        restartWatcherIfChanged(logWatcher, watcherBefore, store);
        deps.registerHotkeys();
    });
}
