/**
 * Pure decision table: maps the profile + selected-leaderboard outcomes to a
 * PlayerResult (docs/API-CLIENT.md). The client never says `nicked` — the
 * lookup layer decides that from the lookup source.
 */

import type { PlayerResult } from '../../shared/types';
import type { Outcome } from './outcome';
import type { ProfileShape } from './rankDisplay';
import { extractStats, hasBedwarsData, profileInfo, type LeaderboardShape } from './statsExtractor';

export interface Selection {
    interval: string;
    mode: string;
}

/** `needsTotal`: the selected view is empty — only the lifetime board can tell why */
export type Decision = { result: PlayerResult } | { needsTotal: true };

export function isLifetimeAllModes(sel: Selection): boolean {
    return sel.interval === 'total' && sel.mode === 'ALL_MODES';
}

export function decidePlayerResult(
    name: string,
    profile: Outcome<ProfileShape>,
    board: Outcome<LeaderboardShape>,
    sel: Selection,
): Decision {
    if (profile.kind === 'auth' || board.kind === 'auth') return { result: { username: name, status: 'auth' } };
    if (profile.kind === 'not_found') return { result: { username: name, status: 'not_found' } };
    if (profile.kind === 'rate_limited' || board.kind === 'rate_limited') {
        return { result: { username: name, status: 'rate_limited' } };
    }
    if (profile.kind !== 'ok') return { result: { username: name, status: 'error' } };

    const username = profile.body.username || name;
    const info = profileInfo(profile.body);
    if (board.kind === 'private') return { result: { username, status: 'api_off', ...info } };
    if (board.kind !== 'ok') return { result: { username, status: 'error' } };

    if (hasBedwarsData(board.body)) return { result: extractStats(username, profile.body, board.body) };
    if (isLifetimeAllModes(sel)) return { result: { username, status: 'never_played', ...info } };
    return { needsTotal: true };
}

/** Second step for an empty selection, given the lifetime/all-modes result */
export function decideFromTotal(total: PlayerResult): PlayerResult {
    if (total.status !== 'ok') return total;
    const { username, rank, level, guild } = total;
    return { username, status: 'no_data', rank, level, guild };
}
