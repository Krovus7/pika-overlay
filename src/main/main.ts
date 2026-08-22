/**
 * Bootstrap + single wiring point. All logWatcher events are bound HERE once
 * (HANDOVER v2.1 rule: never rebind on config saves).
 */

import { app } from 'electron';
import * as os from 'node:os';
import * as path from 'node:path';

import { cache } from './api/cache';
import { ConfigStore } from './config';
import { registerHotkeys, unregisterAll } from './hotkeyManager';
import { IPC_EVENTS } from '../shared/ipc-contract';
import { registerIpcHandlers, pushLogLine, type HandlerDeps } from './ipc/handlers';
import { lookup, type LookupDeps } from './ipc/lookup';
import { LogWatcher } from './log/logWatcher';
import { gameState, partyState, playerRegistry } from './state';
import { LookupQueue } from './state/lookupQueue';
import { createTray } from './tray';
import { createOverlay, getOverlayWin, updateAlwaysOnTop } from './windowManager';

// dist/src/main → project root (main.js is compiled, unlike v3's root main.js)
const rootDir = path.join(__dirname, '..', '..', '..');

// Same config location as v3 (%APPDATA%\pika-overlay\config.json) in both dev
// and packaged builds (ADR-0007). Must run before anything touches userData.
app.setPath('userData', path.join(app.getPath('appData'), 'pika-overlay'));

function defaultLogPath(): string {
    const base = process.platform === 'win32'
        ? path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft')
        : process.platform === 'darwin'
            ? path.join(os.homedir(), 'Library', 'Application Support', 'minecraft')
            : path.join(os.homedir(), '.minecraft');
    return path.join(base, 'logs', 'blclient', 'minecraft', 'latest.log');
}

function send(channel: string, ...args: unknown[]): void {
    getOverlayWin()?.webContents.send(channel, ...args);
}

function removeShownExcept(keep: ReadonlySet<string>): void {
    for (const key of playerRegistry.clearExcept(keep)) {
        send(IPC_EVENTS.PLAYER_REMOVE, key);
    }
}

// ─── Watcher Event Mapping (bound exactly once) ───────────────────────────────
function bindWatcherEvents(logWatcher: LogWatcher, lookupQueue: LookupQueue): void {
    logWatcher.on('log_line', (line: string) => pushLogLine(line));

    logWatcher.on('players_sync', (detectedNames: string[]) => {
        // Block tab updates mid-game
        if (gameState.isInGame()) return;
        removeShownExcept(new Set(detectedNames.map(n => n.toLowerCase())));
    });

    logWatcher.on('pregame_start', () => send(IPC_EVENTS.GAME_PREGAME));

    logWatcher.on('game_start', () => {
        gameState.setInGame(true);
        // Pin party members, clear other players from tracking
        removeShownExcept(new Set(partyState.snapshot()));
        cache.clear();
        send(IPC_EVENTS.GAME_START);
    });

    logWatcher.on('game_end', () => {
        gameState.setInGame(false);
        send(IPC_EVENTS.GAME_END);
    });

    logWatcher.on('players_clear', () => {
        gameState.setInGame(false);
        // Pin party members, clear rest
        removeShownExcept(new Set(partyState.snapshot()));
        cache.clear();
        send(IPC_EVENTS.PLAYERS_CLEAR);
    });

    logWatcher.on('player_detected', (username: string, source: string) => {
        // Block tab detections mid-game
        if (gameState.isInGame() && source === 'tab_list') return;
        lookupQueue.enqueue({ username, source, interval: null, mode: null });
    });

    logWatcher.on('player_quit', (username: string) => {
        const key = username.toLowerCase();
        // Pin party members — never remove them via kill feed
        if (partyState.has(key)) return;
        if (!playerRegistry.has(key)) return;
        playerRegistry.delete(key);
        send(IPC_EVENTS.PLAYER_REMOVE, key);
    });

    logWatcher.on('party_members', (names: string[]) => {
        const newSet = new Set(names.map(n => n.toLowerCase()));

        // Remove players no longer in the party from overlay
        for (const key of partyState.snapshot()) {
            if (!newSet.has(key) && playerRegistry.has(key)) {
                playerRegistry.delete(key);
                send(IPC_EVENTS.PLAYER_REMOVE, key);
            }
        }

        partyState.clear();
        names.forEach(n => partyState.add(n));
        send(IPC_EVENTS.PARTY_UPDATE, partyState.snapshot());
        console.log(`[Party] Sync: ${partyState.snapshot().join(', ')}`);

        // Auto-lookup party members
        for (const name of names) {
            lookupQueue.enqueue({ username: name, source: 'party', interval: null, mode: null });
        }
    });

    logWatcher.on('party_joined', (username: string) => {
        partyState.add(username.toLowerCase());
        send(IPC_EVENTS.PARTY_UPDATE, partyState.snapshot());
        console.log(`[Party] Joined: ${username}`);
        lookupQueue.enqueue({ username, source: 'party', interval: null, mode: null });
    });

    logWatcher.on('party_left', (username: string) => {
        const key = username.toLowerCase();
        partyState.delete(key);

        if (playerRegistry.has(key)) {
            playerRegistry.delete(key);
            send(IPC_EVENTS.PLAYER_REMOVE, key);
        }

        send(IPC_EVENTS.PARTY_UPDATE, partyState.snapshot());
        console.log(`[Party] Left: ${username} — removed from overlay`);
    });

    logWatcher.on('party_clear', () => {
        for (const key of partyState.snapshot()) {
            if (playerRegistry.has(key)) {
                playerRegistry.delete(key);
                send(IPC_EVENTS.PLAYER_REMOVE, key);
            }
        }

        partyState.clear();
        send(IPC_EVENTS.PARTY_UPDATE, []);
        console.log('[Party] Cleared — all pins and party players removed from overlay');
    });
}

// ─── App Bootstrapping ────────────────────────────────────────────────────────
const logWatcher = new LogWatcher();

app.whenReady().then(() => {
    const store = new ConfigStore(ConfigStore.userDataPath(app.getPath('userData')));

    const lookupDeps: LookupDeps = { store, registry: playerRegistry, getOverlayWin };
    const lookupQueue = new LookupQueue(async job => {
        await lookup(job.username, job.source, job.interval, job.mode, lookupDeps);
    });

    // Create overlay
    createOverlay(store, rootDir);
    createTray(rootDir, getOverlayWin);

    // Hotkey registration helper wrapper
    const registerHotkeysFn = () => registerHotkeys({
        store,
        getOverlayWin,
        onClear: () => {
            playerRegistry.clear();
            cache.clear();
            send(IPC_EVENTS.PLAYERS_CLEAR);
        },
    });

    // Register IPC Handlers
    const handlerDeps: HandlerDeps = {
        ...lookupDeps,
        getOverlayWin,
        updateAlwaysOnTop,
        registerHotkeys: registerHotkeysFn,
        logWatcher,
        party: partyState,
    };
    registerIpcHandlers(handlerDeps);

    bindWatcherEvents(logWatcher, lookupQueue);

    // Start watcher — when nicked, use nick name for log detection
    const watcherName = store.get('isNicked') && store.get('myNickName')
        ? store.get('myNickName')
        : store.get('myUsername');
    logWatcher.start(store.get('logPath'), watcherName);

    // Register hotkeys
    registerHotkeysFn();
});

// Subscribing to window-all-closed prevents the default app quit — the overlay
// lives in the tray (v3 behavior).
app.on('window-all-closed', () => {});
app.on('before-quit', () => {
    logWatcher.stop();
    unregisterAll();
});
