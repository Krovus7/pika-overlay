/**
 * Preload bridge — contextIsolation-compatible, exposes the typed
 * window.pikaOverlay API (contract: src/shared/preload-api.ts).
 */

import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS, IPC_EVENTS, type StatsPayload } from './shared/ipc-contract';
import type { PikaOverlayApi } from './shared/preload-api';
import type { ApiHealth, PlayerLoading, UpdateState } from './shared/types';

function on<T>(channel: string, cb: (data: T) => void): void {
    ipcRenderer.removeAllListeners(channel);
    ipcRenderer.on(channel, (_e, data: T) => cb(data));
}

const api: PikaOverlayApi = {
    // === Overlay events ===
    onPlayerStats: (cb) => on<StatsPayload>(IPC_EVENTS.PLAYER_STATS, cb),
    onPlayerLoading: (cb) => on<PlayerLoading>(IPC_EVENTS.PLAYER_LOADING, cb),
    onPlayerRemove: (cb) => on<string>(IPC_EVENTS.PLAYER_REMOVE, cb),
    onPlayersClear: (cb) => on<void>(IPC_EVENTS.PLAYERS_CLEAR, cb),
    onGamePregame: (cb) => on<void>(IPC_EVENTS.GAME_PREGAME, cb),
    onGameStart: (cb) => on<void>(IPC_EVENTS.GAME_START, cb),
    onGameEnd: (cb) => on<void>(IPC_EVENTS.GAME_END, cb),
    onPartyUpdate: (cb) => on<string[]>(IPC_EVENTS.PARTY_UPDATE, cb),
    onSettingsShow: (cb) => on<void>(IPC_EVENTS.SETTINGS_SHOW, cb),
    onConfigUpdate: (cb) => on<Record<string, unknown>>(IPC_EVENTS.CONFIG_UPDATED, cb),

    // === Actions from renderer ===
    lookupPlayer: (username, interval, mode) => ipcRenderer.invoke(IPC_CHANNELS.LOOKUP_PLAYER, username, interval, mode),
    lookupBulk: (names, interval, mode) => ipcRenderer.invoke(IPC_CHANNELS.LOOKUP_BULK, names, interval, mode),
    retryPlayer: (username) => ipcRenderer.invoke(IPC_CHANNELS.LOOKUP_RETRY, username),
    clearPlayers: () => ipcRenderer.invoke(IPC_CHANNELS.PLAYERS_CLEAR),
    refreshPlayers: () => ipcRenderer.invoke(IPC_CHANNELS.PLAYERS_REFRESH),
    openSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_OPEN),
    closeOverlay: () => ipcRenderer.invoke(IPC_CHANNELS.OVERLAY_CLOSE),
    minimizeOverlay: () => ipcRenderer.invoke(IPC_CHANNELS.OVERLAY_MINIMIZE),

    // === Stats interval and mode ===
    setStatsInterval: (interval) => ipcRenderer.invoke(IPC_CHANNELS.STATS_SET_INTERVAL, interval),
    setStatsMode: (mode) => ipcRenderer.invoke(IPC_CHANNELS.STATS_SET_MODE, mode),
    refetchAll: (interval, mode) => ipcRenderer.invoke(IPC_CHANNELS.STATS_REFETCH_ALL, interval, mode),

    // === Config ===
    getConfig: (key) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET, key),
    setConfig: (key, value) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET, key, value),
    getAllConfig: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET_ALL),
    saveConfig: (cfg) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SAVE, cfg),

    // === Settings ===
    browseLogFile: () => ipcRenderer.invoke(IPC_CHANNELS.BROWSE_LOG_FILE),
    testLogPath: (logPath) => ipcRenderer.invoke(IPC_CHANNELS.TEST_LOG_PATH, logPath),
    closeSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_CLOSE),
    getLogLines: () => ipcRenderer.invoke(IPC_CHANNELS.DEBUG_LOG_LINES),

    // === Auto-update (Velopack) ===
    getUpdateState: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_GET_STATE),
    checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK),
    downloadAndApply: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_DOWNLOAD_APPLY),
    onUpdateState: (cb) => on<UpdateState>(IPC_EVENTS.UPDATE_STATE, cb),

    // === API health + key (v5) ===
    getApiHealth: () => ipcRenderer.invoke(IPC_CHANNELS.API_GET_HEALTH),
    onApiHealth: (cb) => on<ApiHealth>(IPC_EVENTS.API_HEALTH, cb),
    testApiKey: (key) => ipcRenderer.invoke(IPC_CHANNELS.API_TEST_KEY, key),
};

contextBridge.exposeInMainWorld('pikaOverlay', api);
