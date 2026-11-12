/**
 * Pika stats API client. Fetches profile and leaderboard in parallel, maps the
 * outcomes through the pure decision table (decision.ts) and caches results.
 * Results never include `nicked` — the lookup layer derives it from the source.
 */

import type { PlayerResult } from '../../shared/types';
import { cache } from './cache';
import { decideFromTotal, decidePlayerResult, type Selection } from './decision';
import { health } from './health';
import { fetchOutcome, type Outcome } from './outcome';
import type { RetryOptions } from './fetch';
import type { ProfileShape } from './rankDisplay';
import type { LeaderboardShape } from './statsExtractor';

export const BASE_URL = 'https://stats.pika-network.net/api';

export const VALID_INTERVALS = ['total', 'weekly', 'monthly', 'yearly'];
export const VALID_MODES = ['ALL_MODES', 'SOLO', 'DOUBLES', 'TRIPLES', 'QUAD'];

const profileUrl = (name: string) => `${BASE_URL}/profile/${encodeURIComponent(name)}`;
const boardUrl = (name: string, sel: Selection) =>
    `${profileUrl(name)}/leaderboard?type=bedwars&interval=${sel.interval}&mode=${sel.mode}`;

async function loadProfile(name: string, retry?: RetryOptions): Promise<Outcome<ProfileShape>> {
    const cached = cache.getProfile(name);
    if (cached) return cached;
    return cache.dedupe(`profile:${name.toLowerCase()}`, async () => {
        const gen = cache.generation;
        const outcome = await fetchOutcome<ProfileShape>(profileUrl(name), retry);
        if ((outcome.kind === 'ok' || outcome.kind === 'not_found') && gen === cache.generation) {
            cache.setProfile(name, outcome);
        }
        return outcome;
    });
}

async function computeStats(name: string, sel: Selection, retry?: RetryOptions): Promise<PlayerResult> {
    const gen = cache.generation;
    const cachedProfile = cache.getProfile(name);
    if (cachedProfile?.kind === 'not_found') return { username: name, status: 'not_found' };

    const [profile, board] = await Promise.all([
        loadProfile(name, retry),
        fetchOutcome<LeaderboardShape>(boardUrl(name, sel), retry),
    ]);

    const decision = decidePlayerResult(name, profile, board, sel);
    const result = 'result' in decision
        ? decision.result
        : decideFromTotal(await resolveStats(name, { interval: 'total', mode: 'ALL_MODES' }, retry));

    if (gen === cache.generation) cache.setStats(statsKey(name, sel), result);
    return result;
}

const statsKey = (name: string, sel: Selection) => `${name}:${sel.interval}:${sel.mode}`;

function resolveStats(name: string, sel: Selection, retry?: RetryOptions): Promise<PlayerResult> {
    const key = statsKey(name, sel);
    const cached = cache.getStats(key);
    if (cached) return Promise.resolve(cached);
    return cache.dedupe(`stats:${key.toLowerCase()}`, () => computeStats(name, sel, retry));
}

/**
 * interval: 'total' | 'weekly' | 'monthly' | 'yearly'  (default 'total')
 * mode:     'ALL_MODES' | 'SOLO' | 'DOUBLES' | 'TRIPLES' | 'QUAD'  (default 'ALL_MODES')
 * retryOptions: optional override for tests.
 * Returns null only for an empty username.
 */
export async function getPlayerStats(
    username: string,
    interval = 'total',
    mode = 'ALL_MODES',
    retryOptions?: RetryOptions,
): Promise<PlayerResult | null> {
    const name = username?.trim();
    if (!name) return null;
    if (health.isAuthBlocked()) return { username: name, status: 'auth' };

    const sel: Selection = {
        interval: VALID_INTERVALS.includes(interval) ? interval : 'total',
        mode: VALID_MODES.includes(mode) ? mode : 'ALL_MODES',
    };
    return resolveStats(name, sel, retryOptions);
}
