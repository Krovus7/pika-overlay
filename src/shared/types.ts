/**
 * Shared types — consumed by main process (api/ipc), preload and renderer.
 */

import type { RankDisplay } from '../main/api/rankDisplay';

export interface PlayerStats {
    username: string;
    notFound: boolean;
    nicked: boolean;
    apiOff: boolean;
    error?: boolean;
    rateLimited?: boolean;
    rank: RankDisplay;
    level: number | null;
    guild: string | null;
    finalKills: number;
    finalDeaths: number;
    fkdr: number;
    wins: number;
    losses: number;
    wlr: number;
    kills: number;
    deaths: number;
    kdr: number;
    bedsDestroyed: number;
    winstreak: number;
    gamesPlayed: number;
    bowKills: number;
    meleeKills: number;
    voidKills: number;
    arrowsShot: number;
    arrowsHit: number;
}

export type LookupSource =
    | 'manual'
    | 'bulk'
    | 'tab_list'
    | 'join'
    | 'kill_feed'
    | 'bed_break'
    | 'team_announce'
    | 'party';

export interface PlayerLoading {
    username: string;
    source: LookupSource | string;
}

export interface PlayerErrorInfo {
    username: string;
    source: LookupSource | string;
}
