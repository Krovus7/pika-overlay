/**
 * Pika stats API client — ported 1:1 from pika-overlay-v3/src/apiClient.js.
 * Same base URL, same endpoint shapes, same nicked/api-off semantics:
 *   404 profile            → nicked (🎭)
 *   200 profile, no BW data → api-off (🔒)
 *   429/503/timeout         → transient error (⚠), never notFound
 */

import type { PlayerStats } from '../../shared/types';
import { cache } from './cache';
import { fetchWithRetry, safeJson, type RetryOptions } from './fetch';
import { extractStats, type LeaderboardShape } from './statsExtractor';
import type { ProfileShape } from './rankDisplay';

export const BASE_URL = 'https://stats.pika-network.net/api';

export const VALID_INTERVALS = ['total', 'weekly', 'monthly', 'yearly'];
export const VALID_MODES = ['ALL_MODES', 'SOLO', 'DOUBLES', 'QUAD'];

/**
 * interval: 'total' | 'weekly' | 'monthly' | 'yearly'  (default 'total')
 * mode:     'ALL_MODES' | 'SOLO' | 'DOUBLES' | 'QUAD'  (default 'ALL_MODES')
 * retryOptions: optional override for tests; default behavior matches v3.
 */
export async function getPlayerStats(
    username: string,
    interval = 'total',
    mode = 'ALL_MODES',
    retryOptions?: RetryOptions,
): Promise<PlayerStats | null> {
    if (!username?.trim()) return null;

    const uname = username.trim();
    const ivl = VALID_INTERVALS.includes(interval) ? interval : 'total';
    const modeKey = VALID_MODES.includes(mode) ? mode : 'ALL_MODES';
    const cacheKey = `${uname}:${ivl}:${modeKey}`;

    const cached = cache.getStats(cacheKey);
    if (cached) return cached;

    try {
        // 1) Profile — rank, level, clan/guild
        const profileRes = await fetchWithRetry(`${BASE_URL}/profile/${encodeURIComponent(uname)}`, retryOptions);

        // 404 = player name does not exist on Pika at all → nicked
        if (profileRes.status === 404) return { username: uname, notFound: true, nicked: true } as PlayerStats;

        // 429/503 still failing after retries = API is overloaded, treat as transient error
        if (profileRes.status === 429 || profileRes.status === 503) {
            console.warn(`[PikaAPI] Rate-limited for profile ${uname} — returning error (not notFound)`);
            return { username: uname, error: true, rateLimited: true } as PlayerStats;
        }

        const profile = (await safeJson(profileRes)) as ProfileShape | null;
        if (!profile) {
            // Unexpected empty/invalid response body — transient, not a permanent notFound
            return { username: uname, error: true } as PlayerStats;
        }

        const exactUsername = profile?.username || uname;

        // 2) BedWars leaderboard stats with chosen interval and mode
        const statsUrl = `${BASE_URL}/profile/${encodeURIComponent(exactUsername)}/leaderboard` +
                         `?type=bedwars&interval=${ivl}&mode=${modeKey}`;
        const statsRes = await fetchWithRetry(statsUrl, retryOptions);

        // 429/503 on leaderboard = rate limited — transient error, not notFound
        if (statsRes.status === 429 || statsRes.status === 503) {
            console.warn(`[PikaAPI] Rate-limited for leaderboard ${exactUsername} — returning error (not notFound)`);
            return { username: exactUsername, error: true, rateLimited: true } as PlayerStats;
        }

        const rawStats = (await safeJson(statsRes)) as LeaderboardShape | null;

        // ── API-off detection ─────────────────────────────────────────────────
        // Profile returned 200, so this name HAS played on Pika. Pika's nick
        // system requires a name that has NEVER been used on the server, meaning
        // a 200 profile can never be a nick. Only a 404 (handled above) is nicked.
        const result = extractStats(exactUsername, profile, rawStats);
        if (!result) {
            return { username: exactUsername, notFound: true, nicked: false, apiOff: true } as PlayerStats;
        }

        cache.setStats(cacheKey, result);
        return result;
    } catch (err) {
        console.error(`[PikaAPI] Error for ${uname}:`, (err as Error).message);
        return { username: uname, error: true } as PlayerStats;
    }
}
