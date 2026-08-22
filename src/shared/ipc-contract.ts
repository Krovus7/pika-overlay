/**
 * IPC contract — typed channel names shared by main, preload and renderer.
 * Same channel set as v3 (no channel removed) plus update channels (Task 10).
 */

import type { PlayerErrorInfo, PlayerLoading, PlayerStats } from './types';

export const IPC_CHANNELS = {
    LOOKUP_PLAYER: 'lookup:player',
    LOOKUP_BULK: 'lookup:bulk',
    STATS_SET_INTERVAL: 'stats:setInterval',
    STATS_SET_MODE: 'stats:setMode',
    STATS_REFETCH_ALL: 'stats:refetchAll',
    PLAYERS_CLEAR: 'players:clear',
    SETTINGS_OPEN: 'settings:open',
    SETTINGS_CLOSE: 'settings:close',
    OVERLAY_CLOSE: 'overlay:close',
    OVERLAY_MINIMIZE: 'overlay:minimize',
    CONFIG_GET: 'config:get',
    CONFIG_GET_ALL: 'config:getAll',
    CONFIG_SET: 'config:set',
    CONFIG_SAVE: 'config:save',
    BROWSE_LOG_FILE: 'browse:logFile',
    TEST_LOG_PATH: 'test:logPath',
    DEBUG_LOG_LINES: 'debug:logLines',
    UPDATE_GET_STATE: 'update:getState',
    UPDATE_CHECK: 'update:check',
    UPDATE_DOWNLOAD_APPLY: 'update:downloadApply',
} as const;

export const IPC_EVENTS = {
    PLAYER_STATS: 'player:stats',
    PLAYER_LOADING: 'player:loading',
    PLAYER_ERROR: 'player:error',
    PLAYER_REMOVE: 'player:remove',
    PLAYERS_CLEAR: 'players:clear',
    GAME_PREGAME: 'game:pregame',
    GAME_START: 'game:start',
    GAME_END: 'game:end',
    PARTY_UPDATE: 'party:update',
    SETTINGS_SHOW: 'settings:show',
    CONFIG_UPDATED: 'config:updated',
    UPDATE_STATE: 'update:state',
} as const;

export interface StatsPayload extends PlayerStats {
    source: string;
}

export type { PlayerErrorInfo, PlayerLoading, PlayerStats };
