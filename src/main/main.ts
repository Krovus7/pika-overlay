/**
 * Bootstrap + single wiring point. Watcher events are bound once, in
 * watcherBindings.ts, from here (HANDOVER v2.1 rule: never rebind on saves).
 */

import { app } from 'electron';
import * as os from 'node:os';
import * as path from 'node:path';

import { setApiKey } from './api/apiSession';
import { ConfigStore } from './config';
import { driveShots, shotsRequested } from './devShots';
import { registerHotkeys, unregisterAll } from './hotkeyManager';
import { IPC_EVENTS } from '../shared/ipc-contract';
import { clearPlayers } from './ipc/clearPlayers';
import { registerIpcHandlers, type HandlerDeps } from './ipc/handlers';
import { LookupService, type LookupDeps } from './ipc/lookup';
import { LogWatcher } from './log/logWatcher';
import { driveReplay, replayFilePath } from './replay';
import { gameState, partyState, playerRegistry } from './state';
import { LookupQueue } from './state/lookupQueue';
import { createTray } from './tray';
import { checkForUpdates, onUpdateStateChange, runStartupHooks } from './update/velopackUpdate';
import { bindWatcherEvents } from './watcherBindings';
import { applyWindowConfig, createOverlay, getOverlayWin } from './windowManager';
import { watcherSettings } from './ipc/configHandlers';

// dist/src/main → project root (main.js is compiled, unlike v3's root main.js)
const rootDir = path.join(__dirname, '..', '..', '..');

// Same config location as v3 (%APPDATA%\pika-overlay\config.json) in both dev
// and packaged builds (ADR-0007). Must run before anything touches userData.
app.setPath('userData', path.join(app.getPath('appData'), 'pika-overlay'));

// Velopack startup hooks (first-run / pending restart) — packaged only
runStartupHooks();

function send(channel: string, ...args: unknown[]): void {
    getOverlayWin()?.webContents.send(channel, ...args);
}

const logWatcher = new LogWatcher();

app.whenReady().then(() => {
    const store = new ConfigStore(ConfigStore.userDataPath(app.getPath('userData')));
    setApiKey(store.get('apiKey'));

    const lookupDeps: LookupDeps = { store, registry: playerRegistry, getOverlayWin };
    const service = new LookupService(lookupDeps);
    const queue = new LookupQueue(async job => {
        if (job.refresh) await service.refresh(job.username, job.interval, job.mode);
        else await service.lookup(job.username, job.source, job.interval, job.mode);
    });

    createOverlay(store, rootDir);
    createTray(rootDir, getOverlayWin);

    const registerHotkeysFn = () => registerHotkeys({
        store,
        getOverlayWin,
        onClear: () => clearPlayers({ registry: playerRegistry, party: partyState, queue, send }),
    });

    const handlerDeps: HandlerDeps = {
        ...lookupDeps,
        service,
        queue,
        applyWindowConfig,
        registerHotkeys: registerHotkeysFn,
        logWatcher,
        party: partyState,
    };
    registerIpcHandlers(handlerDeps);

    // Broadcast update state changes to the overlay (settings panel)
    onUpdateStateChange(s => send(IPC_EVENTS.UPDATE_STATE, s));

    bindWatcherEvents({
        logWatcher, queue, registry: playerRegistry, party: partyState, game: gameState, send,
    });

    // Dev-only screenshot drive: no log watcher, no update check (offline)
    if (shotsRequested()) void driveShots({ getOverlayWin, rootDir });
    else startWatcher(store);

    if (!shotsRequested() && store.get('updateAutoCheck')) void checkForUpdates();

    registerHotkeysFn();
});

function startWatcher(store: ConfigStore): void {
    const { logPath, name } = watcherSettings(store);
    const replayPath = replayFilePath();
    logWatcher.start(
        replayPath ?? logPath,
        name,
        replayPath ? { fromBeginning: true, pollMs: 50 } : undefined,
    );
    // Dev-only replay screenshot drive (offline verification)
    if (replayPath) void driveReplay({ getOverlayWin, rootDir });
}

// Subscribing to window-all-closed prevents the default app quit — the overlay
// lives in the tray (v3 behavior).
app.on('window-all-closed', () => {});
app.on('before-quit', () => {
    logWatcher.stop();
    unregisterAll();
});
