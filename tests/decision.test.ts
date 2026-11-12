/**
 * Pure decision table (api/decision.ts): every row, no network involved.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { decideFromTotal, decidePlayerResult, type Selection } from '../src/main/api/decision';
import type { Outcome } from '../src/main/api/outcome';
import type { ProfileShape } from '../src/main/api/rankDisplay';
import type { LeaderboardShape } from '../src/main/api/statsExtractor';
import type { PlayerResult } from '../src/shared/types';

const TOTAL: Selection = { interval: 'total', mode: 'ALL_MODES' };
const WEEKLY: Selection = { interval: 'weekly', mode: 'SOLO' };

const okProfile: Outcome<ProfileShape> = {
    kind: 'ok',
    body: { username: 'Real', rank: { level: 5 }, clan: { name: 'G' } },
};
const dataBoard: Outcome<LeaderboardShape> = { kind: 'ok', body: { Kills: { entries: [{ value: '3' }] } } };
const nullBoard: Outcome<LeaderboardShape> = { kind: 'ok', body: { Kills: { entries: null } } };

function result(profile: Outcome<ProfileShape>, board: Outcome<LeaderboardShape>, sel = TOTAL): PlayerResult {
    const d = decidePlayerResult('typed', profile, board, sel);
    assert.ok('result' in d, 'expected a final result');
    return d.result;
}

describe('decidePlayerResult', () => {
    it('auth on either request → auth, even if the other is fine', () => {
        assert.equal(result({ kind: 'auth' }, dataBoard).status, 'auth');
        assert.equal(result(okProfile, { kind: 'auth' }).status, 'auth');
    });

    it('profile 404 → not_found regardless of the leaderboard outcome', () => {
        for (const board of [{ kind: 'error' }, { kind: 'not_found' }, dataBoard] as Array<Outcome<LeaderboardShape>>) {
            assert.deepEqual(result({ kind: 'not_found' }, board), { username: 'typed', status: 'not_found' });
        }
    });

    it('rate limited on either request → rate_limited', () => {
        assert.equal(result({ kind: 'rate_limited' }, dataBoard).status, 'rate_limited');
        assert.equal(result(okProfile, { kind: 'rate_limited' }).status, 'rate_limited');
    });

    it('error / private-without-profile / not_found board → error, never api_off', () => {
        assert.equal(result({ kind: 'error' }, dataBoard).status, 'error');
        assert.equal(result({ kind: 'error' }, { kind: 'private' }).status, 'error');
        assert.equal(result(okProfile, { kind: 'error' }).status, 'error');
        assert.equal(result(okProfile, { kind: 'not_found' }).status, 'error');
    });

    it('entries present → ok, display name from the profile', () => {
        const r = result(okProfile, dataBoard, WEEKLY);
        assert.equal(r.status, 'ok');
        assert.equal(r.username, 'Real');
    });

    it('display name falls back to the typed name', () => {
        const r = result({ kind: 'ok', body: {} }, dataBoard);
        assert.equal(r.username, 'typed');
    });

    it('204 → api_off with profile info, on any selection', () => {
        for (const sel of [TOTAL, WEEKLY]) {
            const r = result(okProfile, { kind: 'private' }, sel);
            assert.ok(r.status === 'api_off');
            assert.equal(r.level, 5);
            assert.equal(r.guild, 'G');
        }
    });

    it('all-null on total/ALL_MODES → never_played', () => {
        assert.equal(result(okProfile, nullBoard, TOTAL).status, 'never_played');
    });

    it('all-null on any other selection → needs the lifetime check', () => {
        for (const sel of [WEEKLY, { interval: 'total', mode: 'SOLO' }, { interval: 'monthly', mode: 'ALL_MODES' }]) {
            assert.deepEqual(decidePlayerResult('typed', okProfile, nullBoard, sel), { needsTotal: true });
        }
    });
});

describe('decideFromTotal', () => {
    const info = { rank: { text: 'X', color: '#fff' }, level: 5, guild: 'G' };

    it('lifetime data exists → no_data with profile info', () => {
        const total = result(okProfile, dataBoard);
        const r = decideFromTotal(total);
        assert.ok(r.status === 'no_data');
        assert.equal(r.level, 5);
        assert.equal(r.guild, 'G');
    });

    it('lifetime empty / private / failures pass through unchanged', () => {
        const passthrough: PlayerResult[] = [
            { username: 'a', status: 'never_played', ...info },
            { username: 'a', status: 'api_off', ...info },
            { username: 'a', status: 'error' },
            { username: 'a', status: 'rate_limited' },
            { username: 'a', status: 'auth' },
        ];
        for (const total of passthrough) assert.deepEqual(decideFromTotal(total), total);
    });
});
