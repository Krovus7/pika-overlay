/**
 * IPC contract — typed channel names shared by main, preload and renderer.
 * v5: every lookup outcome travels on player:stats (status field); the
 * player:error event is gone; api:* channels added (ADR-0010).
 */

import type { PlayerLoading, PlayerResult } from './types';

export const IPC_CHANNELS = {
    LOOKUP_PLAYER: 'lookup:player',
    LOOKUP_BULK: 'lookup:bulk',
    LOOKUP_RETRY: 'lookup:retry',
    STATS_SET_INTERVAL: 'stats:setInterval',
    STATS_SET_MODE: 'stats:setMode',
    STATS_REFETCH_ALL: 'stats:refetchAll',
    PLAYERS_CLEAR: 'players:clear',
    PLAYERS_REFRESH: 'players:refresh',
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
    API_GET_HEALTH: 'api:getHealth',
    API_TEST_KEY: 'api:testKey',
} as const;

export const IPC_EVENTS = {
    PLAYER_STATS: 'player:stats',
    PLAYER_LOADING: 'player:loading',
    PLAYER_REMOVE: 'player:remove',
    PLAYERS_CLEAR: 'players:clear',
    GAME_PREGAME: 'game:pregame',
    GAME_START: 'game:start',
    GAME_END: 'game:end',
    PARTY_UPDATE: 'party:update',
    SETTINGS_SHOW: 'settings:show',
    CONFIG_UPDATED: 'config:updated',
    UPDATE_STATE: 'update:state',
    API_HEALTH: 'api:health',
} as const;

export type StatsPayload = PlayerResult & { source: string };

export type { PlayerLoading, PlayerResult };
