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
    SETTINGS_MINIMIZE: 'settings:minimize',
    OVERLAY_DEMO: 'overlay:demo',
    CLIPBOARD_COPY: 'clipboard:copy',
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
    WATCHLIST_GET: 'watchlist:get',
    WATCHLIST_SET: 'watchlist:set',
    WATCHLIST_REMOVE_LIST: 'watchlist:removeList',
    WATCHLIST_EXPORT: 'watchlist:export',
    WATCHLIST_COPY_TEXT: 'watchlist:copyText',
    WATCHLIST_IMPORT_FILE: 'watchlist:importFile',
    WATCHLIST_IMPORT_TEXT: 'watchlist:importText',
    WATCHLIST_CONFIRM_IMPORT: 'watchlist:confirmImport',
    WATCHLIST_LINK_NICK: 'watchlist:linkNick',
    WATCHLIST_UNLINK_NICK: 'watchlist:unlinkNick',
    WATCHLIST_MENU: 'watchlist:menu',
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
    SETTINGS_TAB: 'settings:tab',
    OVERLAY_DEMO: 'overlay:demo',
    CONFIG_UPDATED: 'config:updated',
    UPDATE_STATE: 'update:state',
    API_HEALTH: 'api:health',
    WATCHLIST_UPDATED: 'watchlist:updated',
    WATCHLIST_ALERT: 'watchlist:alert',
} as const;

/** Tab ids of the settings window, in display order. */
export const SETTINGS_TAB_IDS = ['general', 'api', 'appearance', 'columns', 'stats', 'updates', 'debug', 'watchlist'] as const;

export type StatsPayload = PlayerResult & { source: string };

export type { PlayerLoading, PlayerResult };
