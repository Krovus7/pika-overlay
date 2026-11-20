/**
 * PikaOverlay API surface exposed to the renderer via contextBridge.
 * Typed here so the renderer bundle shares the exact contract.
 */

import type { ApiHealth, ApiKeyTestResult, PlayerLoading, UpdateState } from './types';
import type { StatsPayload } from './ipc-contract';
import type { ImportAttempt, WatchKind, WatchlistSnapshot } from './watchlist';

export interface PikaOverlayApi {
    // === Overlay events ===
    onPlayerStats: (cb: (data: StatsPayload) => void) => void;
    onPlayerLoading: (cb: (data: PlayerLoading) => void) => void;
    onPlayerRemove: (cb: (username: string) => void) => void;
    onPlayersClear: (cb: () => void) => void;
    onGamePregame: (cb: () => void) => void;
    onGameStart: (cb: () => void) => void;
    onGameEnd: (cb: () => void) => void;
    onPartyUpdate: (cb: (members: string[]) => void) => void;
    /** Settings window only: switch to this tab (sent when it is opened again with a tab) */
    onSettingsTab: (cb: (tab: string) => void) => void;
    /** Overlay only: show (true) or remove (false) the sample players */
    onDemo: (cb: (on: boolean) => void) => void;
    onConfigUpdate: (cb: (cfg: Record<string, unknown>) => void) => void;

    // === Actions from renderer ===
    lookupPlayer: (username: string, interval: string | null, mode: string | null) => Promise<unknown>;
    lookupBulk: (names: string[], interval: string | null, mode: string | null) => Promise<unknown>;
    /** Re-run the lookup of a row already shown (keeps its original source) */
    retryPlayer: (username: string) => Promise<void>;
    clearPlayers: () => Promise<void>;
    /** Empty the stats cache and re-fetch every shown player */
    refreshPlayers: () => Promise<void>;
    /** Opens the settings window, or focuses it; optionally on a tab */
    openSettings: (tab?: string) => Promise<void>;
    /** Asks the overlay to show or remove its sample players (Appearance preview) */
    setDemo: (on: boolean) => Promise<void>;
    /** Copies a short text (1-32 characters) to the system clipboard */
    copyText: (text: string) => Promise<void>;
    closeOverlay: () => Promise<void>;
    minimizeOverlay: () => Promise<void>;

    // === Stats interval and mode ===
    setStatsInterval: (interval: string) => Promise<void>;
    setStatsMode: (mode: string) => Promise<void>;
    /** Re-fetch every shown player for a new period/mode (sources preserved) */
    refetchAll: (interval: string, mode: string | null) => Promise<void>;

    // === Config ===
    getConfig: (key: string) => Promise<unknown>;
    setConfig: (key: string, value: unknown) => Promise<void>;
    getAllConfig: () => Promise<Record<string, unknown>>;
    saveConfig: (cfg: Record<string, unknown>) => Promise<void>;

    // === Settings window ===
    browseLogFile: () => Promise<string | null>;
    testLogPath: (logPath: string) => Promise<boolean>;
    closeSettings: () => Promise<void>;
    minimizeSettings: () => Promise<void>;
    getLogLines: () => Promise<string[]>;

    // === Auto-update (Velopack) ===
    getUpdateState: () => Promise<UpdateState>;
    checkForUpdates: () => Promise<UpdateState>;
    downloadAndApply: () => Promise<UpdateState>;
    onUpdateState: (cb: (s: UpdateState) => void) => void;

    // === API health + key (v5) ===
    getApiHealth: () => Promise<ApiHealth>;
    onApiHealth: (cb: (h: ApiHealth) => void) => void;
    /** Validates a key against the live API without saving it */
    testApiKey: (key: string) => Promise<ApiKeyTestResult>;
    // === Watchlist and nick links (Task 3) ===
    getWatchlist: () => Promise<WatchlistSnapshot>;
    /** Adds or changes the own entry; null removes it. False when refused (invalid name, limit) */
    setWatchEntry: (name: string, change: { kind: WatchKind; note: string } | null) => Promise<boolean>;
    removeWatchList: (id: string) => Promise<boolean>;
    /** Save dialog; resolves to the written path or null (cancelled or failed) */
    exportWatchlist: (opts: { includeImported: boolean }) => Promise<string | null>;
    /** Puts the own entries on the clipboard, one per line */
    copyWatchlistText: () => Promise<void>;
    /** Open dialog + parse; nothing is saved until confirmWatchImport */
    importWatchlistFile: () => Promise<ImportAttempt>;
    importWatchlistText: (text: string, defaultKind: WatchKind) => Promise<ImportAttempt>;
    confirmWatchImport: (token: string) => Promise<boolean>;
    /** Friend null or '' = teammate not named. False when a name is invalid */
    linkNick: (nick: string, friend: string | null) => Promise<boolean>;
    unlinkNick: (nick: string) => Promise<boolean>;
    onWatchlistUpdate: (cb: (data: WatchlistSnapshot) => void) => void;
}
