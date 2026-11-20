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
import { registerWatchlistHandlers } from './ipc/watchlistHandlers';
import { registerWatchlistMenu } from './ipc/watchlistMenu';
import { LogWatcher } from './log/logWatcher';
import { driveReplay, replayFilePath } from './replay';
import { gameState, partyState, playerRegistry } from './state';
import { LookupQueue } from './state/lookupQueue';
import { createTray } from './tray';
import { checkForUpdates, onUpdateStateChange, runStartupHooks } from './update/velopackUpdate';
import { bindWatcherEvents } from './watcherBindings';
import { clearAlertFlash, deliverAlert } from './watchlist/alertDelivery';
import { WatchAlerts } from './watchlist/alerts';
import { getWatchlist, initWatchlist } from './watchlist/instance';
import { linkNickAndHide } from './watchlist/nickLink';
import { notifyWatchlist } from './watchlist/notify';
import { WatchlistStore } from './watchlist/store';
import { applyWindowConfig, createOverlay, getOverlayWin, resizeForScale, switchLayoutSize } from './windowManager';
import { broadcast } from './broadcast';
import { applySettingsWindowConfig, initSettingsWindow, openSettings } from './settingsWindow';
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

    initWatchlist(new WatchlistStore(WatchlistStore.userDataPath(app.getPath('userData'))));
    const watchlist = getWatchlist();
    const alerts = new WatchAlerts(
        name => watchlist.lookup(name),
        name => name.toLowerCase() === watcherSettings(store).name.toLowerCase() || partyState.has(name),
    );
    const lookupDeps: LookupDeps = {
        store, registry: playerRegistry, getOverlayWin,
        isLinkedNick: name => watchlist.isLinkedNick(name),
        onPlayerEnter: (name, source) => {
            const entry = alerts.check(name, source);
            if (entry) deliverAlert(getOverlayWin(), name, entry);
        },
    };
    const service = new LookupService(lookupDeps);
    const queue = new LookupQueue(async job => {
        if (job.refresh) await service.refresh(job.username, job.interval, job.mode, job.fresh);
        else await service.lookup(job.username, job.source, job.interval, job.mode, job.fresh);
    });

    createOverlay(store, rootDir);
    const stopFlash = (): void => clearAlertFlash(getOverlayWin());
    getOverlayWin()?.on('show', stopFlash);
    getOverlayWin()?.on('restore', stopFlash);
    getOverlayWin()?.on('focus', stopFlash);
    initSettingsWindow({ store, rootDir, getOverlayWin });
    createTray(rootDir, getOverlayWin, openSettings);

    const registerHotkeysFn = () => registerHotkeys({
        store,
        getOverlayWin,
        onClear: () => clearPlayers({ registry: playerRegistry, party: partyState, queue, send }),
    });

    const handlerDeps: HandlerDeps = {
        ...lookupDeps,
        service,
        queue,
        applyWindowConfig: s => { applyWindowConfig(s); applySettingsWindowConfig(s); },
        resizeForScale: (oldScale, newScale) => resizeForScale(store, oldScale, newScale),
        switchLayoutSize: oldMode => switchLayoutSize(store, oldMode),
        registerHotkeys: registerHotkeysFn,
        logWatcher,
        party: partyState,
    };
    registerIpcHandlers(handlerDeps);
    const linkNick = (nick: string, friend: string | null): boolean =>
        linkNickAndHide(watchlist, playerRegistry, key => send(IPC_EVENTS.PLAYER_REMOVE, key), nick, friend);
    registerWatchlistHandlers(watchlist, linkNick);
    registerWatchlistMenu({ store: watchlist, party: partyState, linkNick });

    onUpdateStateChange(s => broadcast(IPC_EVENTS.UPDATE_STATE, s));

    bindWatcherEvents({
        logWatcher, queue, registry: playerRegistry, party: partyState, game: gameState, send,
        isSelf: name => name.toLowerCase() === watcherSettings(store).name.toLowerCase(),
        onLobbyClear: () => alerts.reset(),
        onPartyChange: wasNonEmpty => {
            if (watchlist.pruneNickLinks(partyState.snapshot(), wasNonEmpty)) notifyWatchlist(watchlist);
        },
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
    // Dev-only replay screenshot drive (offline verification); PIKA_REPLAY_DRIVE=0 only feeds
    // the log, for tools that drive the window themselves (scripts/replay-live.mjs)
    if (replayPath && process.env.PIKA_REPLAY_DRIVE !== '0') void driveReplay({ getOverlayWin, rootDir });
}

// Subscribing to window-all-closed prevents the default app quit — the overlay
// lives in the tray (v3 behavior).
app.on('window-all-closed', () => {});
app.on('before-quit', () => {
    logWatcher.stop();
    unregisterAll();
});
