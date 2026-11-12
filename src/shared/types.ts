/**
 * Shared types — consumed by main process (api/ipc), preload and renderer.
 */

import type { RankDisplay } from '../main/api/rankDisplay';

export type StatsInterval = 'total' | 'weekly' | 'monthly' | 'yearly';
export type StatsMode = 'ALL_MODES' | 'SOLO' | 'DOUBLES' | 'TRIPLES' | 'QUAD';
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

// ─── Auto-update state (Velopack) ────────────────────────────────────────────
export type UpdateState =
    | { kind: 'disabled'; message: string }
    | { kind: 'idle' }
    | { kind: 'checking' }
    | { kind: 'available'; version: string }
    | { kind: 'uptodate' }
    | { kind: 'downloading'; progress: number }
    | { kind: 'ready'; version: string }
    | { kind: 'error'; message: string };

// ─── Player lookup result (v5, ADR-0010) ─────────────────────────────────────
// `status` is the single source of truth for how a row is classified:
//   ok           profile + BedWars data for the selected period/mode
//   nicked       name unknown to Pika (404) and seen live in a game → nick
//   not_found    name unknown to Pika (404) but typed by the user → typo or nick
//   api_off      player keeps stats private (leaderboard answers 204)
//   never_played public profile with no BedWars data at all, lifetime
//   no_data      BedWars data exists, but none in the selected period/mode
//   error        transient failure (timeout, network, 5xx, invalid body)
//   rate_limited 429/503 still failing after retries
//   auth         API key missing or rejected (401)
export type PlayerStatus =
    | 'ok' | 'nicked' | 'not_found' | 'api_off' | 'never_played' | 'no_data'
    | 'error' | 'rate_limited' | 'auth';

export interface PlayerProfileInfo {
    rank: RankDisplay;
    level: number | null;
    guild: string | null;
}

export interface BedwarsNumbers {
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

export type PlayerStats = { username: string; status: 'ok' } & PlayerProfileInfo & BedwarsNumbers;

export type PlayerResult =
    | PlayerStats
    | ({ username: string; status: 'api_off' | 'never_played' | 'no_data' } & PlayerProfileInfo)
    | { username: string; status: 'nicked' | 'not_found' | 'error' | 'rate_limited' | 'auth' };

export type LookupSource =
    | 'manual'
    | 'bulk'
    | 'tab_list'
    | 'join'
    | 'kill_feed'
    | 'bed_break'
    | 'team_announce'
    | 'party';

/** Sources typed by the user: an unknown name there is a typo first, a nick second. */
export const USER_TYPED_SOURCES: readonly string[] = ['manual', 'bulk'];

export interface PlayerLoading {
    username: string;
    source: LookupSource | string;
}

// ─── API health (v5) — one global signal instead of one error per row ────────
export type ApiHealth =
    | { kind: 'ok' }
    | { kind: 'key_missing' }
    | { kind: 'key_invalid' }
    | { kind: 'rate_limited'; retryAt: number } // epoch ms when requests resume
    | { kind: 'unreachable' };

export interface ApiKeyTestResult {
    ok: boolean;
    reason: 'ok' | 'missing' | 'invalid' | 'rate_limited' | 'unreachable';
}
