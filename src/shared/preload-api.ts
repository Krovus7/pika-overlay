/**
 * PikaOverlay API surface exposed to the renderer via contextBridge.
 * Typed here so the renderer bundle shares the exact contract.
 */

import type { PlayerErrorInfo, PlayerLoading, PlayerStats } from './types';
import type { StatsPayload } from './ipc-contract';

export interface PikaOverlayApi {
    // === Overlay events ===
    onPlayerStats: (cb: (data: StatsPayload) => void) => void;
    onPlayerLoading: (cb: (data: PlayerLoading) => void) => void;
    onPlayerError: (cb: (data: PlayerErrorInfo) => void) => void;
    onPlayerRemove: (cb: (username: string) => void) => void;
    onPlayersClear: (cb: () => void) => void;
    onGamePregame: (cb: () => void) => void;
    onGameStart: (cb: () => void) => void;
    onGameEnd: (cb: () => void) => void;
    onPartyUpdate: (cb: (members: string[]) => void) => void;
    onSettingsShow: (cb: () => void) => void;
    onConfigUpdate: (cb: (cfg: Record<string, unknown>) => void) => void;

    // === Actions from renderer ===
    lookupPlayer: (username: string, interval: string | null, mode: string | null) => Promise<unknown>;
    lookupBulk: (names: string[], interval: string | null, mode: string | null) => Promise<unknown>;
    clearPlayers: () => Promise<void>;
    openSettings: () => Promise<void>;
    closeOverlay: () => Promise<void>;
    minimizeOverlay: () => Promise<void>;

    // === Stats interval and mode ===
    setStatsInterval: (interval: string) => Promise<void>;
    setStatsMode: (mode: string) => Promise<void>;
    refetchAll: (names: string[], interval: string, mode: string | null) => Promise<unknown>;

    // === Config ===
    getConfig: (key: string) => Promise<unknown>;
    setConfig: (key: string, value: unknown) => Promise<void>;
    getAllConfig: () => Promise<Record<string, unknown>>;
    saveConfig: (cfg: Record<string, unknown>) => Promise<void>;

    // === Settings window ===
    browseLogFile: () => Promise<string | null>;
    testLogPath: (logPath: string) => Promise<boolean>;
    closeSettings: () => Promise<void>;
    getLogLines: () => Promise<string[]>;
}
