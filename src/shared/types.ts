/**
 * Shared types — consumed by main process (api/ipc), preload and renderer.
 */

import type { RankDisplay } from '../main/api/rankDisplay';

export type StatsInterval = 'total' | 'weekly' | 'monthly' | 'yearly';
export type StatsMode = 'ALL_MODES' | 'SOLO' | 'DOUBLES' | 'QUAD';
export type RatioKey = 'fkdr' | 'kdr' | 'wlr';
export type TierKey = 'hacker' | 'godlike' | 'good' | 'medium';

export interface RatioThresholds {
    fkdr: Record<TierKey, number>;
    kdr: Record<TierKey, number>;
    wlr: Record<TierKey, number>;
}

export interface RatioColors {
    hacker: string;
    godlike: string;
    good: string;
    medium: string;
    bad: string;
}

// ─── Auto-update state (Velopack, Task 10) ───────────────────────────────────
export type UpdateState =
    | { kind: 'disabled'; message: string }
    | { kind: 'idle' }
    | { kind: 'checking' }
    | { kind: 'available'; version: string }
    | { kind: 'uptodate' }
    | { kind: 'downloading'; progress: number }
    | { kind: 'ready'; version: string }
    | { kind: 'error'; message: string };

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
