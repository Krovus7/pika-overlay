/**
 * API client tests — fetch is mocked on globalThis; retry delays are shrunk
 * via the optional retryOptions param. Covers every row of the decision
 * table, key/health behavior, caching and in-flight de-duplication.
 */

import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getPlayerStats } from '../src/main/api/apiClient';
import { setApiKey } from '../src/main/api/apiSession';
import { cache } from '../src/main/api/cache';
import { getHealth } from '../src/main/api/health';
import {
    FAST_RETRY, LEADERBOARD_NULL, LEADERBOARD_OK, calls, callsTo, empty, freshSession,
    json, mockFetch, profileBody, restoreFetch, routes,
} from './apiMock';

const profile200 = () => json(profileBody('PlayerX', { rank: { rankDisplay: 'TITAN', level: 42 }, clan: { name: 'GuildOfPika' } }));

describe('getPlayerStats — basics and key handling', () => {
    beforeEach(() => freshSession());
    after(() => { cache.clear(); restoreFetch(); });

    it('returns null for empty username', async () => {
        assert.equal(await getPlayerStats('   '), null);
    });

    it('sends the X-Api-Key header on profile and leaderboard requests', async () => {
        mockFetch(routes(profile200, () => json(LEADERBOARD_OK)));
        await getPlayerStats('PlayerX', 'total', 'ALL_MODES', FAST_RETRY);
        assert.equal(calls.length, 2);
        assert.ok(calls.every(c => c.key === 'test-key'), 'every request carries the key');
    });

    it('no key → auth with zero network calls and health key_missing', async () => {
        setApiKey('');
        mockFetch(() => { throw new Error('must not be called'); });
        const r = await getPlayerStats('PlayerX', 'total', 'ALL_MODES', FAST_RETRY);
        assert.deepEqual(r, { username: 'PlayerX', status: 'auth' });
        assert.equal(calls.length, 0);
        assert.equal(getHealth().kind, 'key_missing');
    });

    it('401 → auth + key_invalid, then short-circuits; a new key resets health', async () => {
        mockFetch(() => json({ error: 'invalid api key' }, 401));
        const first = await getPlayerStats('PlayerX', 'total', 'ALL_MODES', FAST_RETRY);
        assert.equal(first?.status, 'auth');
        assert.equal(getHealth().kind, 'key_invalid');
        assert.equal(calls.length, 2, '401 is never retried');

        const before = calls.length;
        const second = await getPlayerStats('Other', 'total', 'ALL_MODES', FAST_RETRY);
        assert.equal(second?.status, 'auth');
        assert.equal(calls.length, before, 'no network once the key is known bad');

        setApiKey('another-key');
        assert.equal(getHealth().kind, 'ok');
    });

    it('invalid interval/mode fall back to total/ALL_MODES in the URL', async () => {
        mockFetch(routes(profile200, () => json(LEADERBOARD_OK)));
        await getPlayerStats('PlayerX', 'hourly', 'SQUADS', FAST_RETRY);
        assert.ok(calls.some(c => c.url.includes('interval=total&mode=ALL_MODES')));
    });

    it('TRIPLES is a valid mode', async () => {
        mockFetch(routes(profile200, () => json(LEADERBOARD_OK)));
        await getPlayerStats('PlayerX', 'total', 'TRIPLES', FAST_RETRY);
        assert.ok(calls.some(c => c.url.includes('mode=TRIPLES')));
    });
});

describe('getPlayerStats — decision table', () => {
    beforeEach(() => freshSession());
    after(() => { cache.clear(); restoreFetch(); });

    it('404 profile → not_found (never nicked at client level)', async () => {
        mockFetch(routes(() => empty(404), () => empty(400)));
        const r = await getPlayerStats('xXzRandomNick9182Xx', 'total', 'ALL_MODES', FAST_RETRY);
        assert.deepEqual(r, { username: 'xXzRandomNick9182Xx', status: 'not_found' });
    });

    it('404 is negative-cached: a repeat lookup makes no request', async () => {
        mockFetch(routes(() => empty(404), () => empty(400)));
        await getPlayerStats('Ghost', 'total', 'ALL_MODES', FAST_RETRY);
        const before = calls.length;
        const again = await getPlayerStats('Ghost', 'weekly', 'SOLO', FAST_RETRY);
        assert.equal(again?.status, 'not_found');
        assert.equal(calls.length, before);
    });

    it('429 after retries → rate_limited, retried maxRetries+1 times per request', async () => {
        mockFetch(() => new Response('slow down', { status: 429, headers: { 'retry-after': '0' } }));
        const r = await getPlayerStats('SomePlayer', 'total', 'ALL_MODES', FAST_RETRY);
        assert.equal(r?.status, 'rate_limited');
        assert.equal(calls.length, 6, '3 attempts for profile + 3 for leaderboard');
    });

    it('503 on the leaderboard only → rate_limited', async () => {
        mockFetch(routes(profile200, () => empty(503)));
        const r = await getPlayerStats('PlayerX', 'total', 'ALL_MODES', FAST_RETRY);
        assert.equal(r?.status, 'rate_limited');
    });

    it('timeout → error (not not_found), health unreachable, cleared by next success', async () => {
        mockFetch(() => { throw new DOMException('aborted', 'AbortError'); });
        const r = await getPlayerStats('SlowPlayer', 'total', 'ALL_MODES', FAST_RETRY);
        assert.equal(r?.status, 'error');
        assert.equal(getHealth().kind, 'unreachable');

        mockFetch(routes(profile200, () => json(LEADERBOARD_OK)));
        const ok = await getPlayerStats('PlayerX', 'total', 'ALL_MODES', FAST_RETRY);
        assert.equal(ok?.status, 'ok');
        assert.equal(getHealth().kind, 'ok');
    });

    it('leaderboard 500 → error, never api_off', async () => {
        mockFetch(routes(profile200, () => empty(500)));
        const r = await getPlayerStats('PlayerX', 'total', 'ALL_MODES', FAST_RETRY);
        assert.equal(r?.status, 'error');
    });

    it('profile 500 → error', async () => {
        mockFetch(routes(() => empty(500), () => json(LEADERBOARD_OK)));
        assert.equal((await getPlayerStats('PlayerX', 'total', 'ALL_MODES', FAST_RETRY))?.status, 'error');
    });

    it('non-JSON 200 body (profile or leaderboard) → error', async () => {
        mockFetch(routes(() => new Response('<html>', { status: 200 }), () => json(LEADERBOARD_OK)));
        assert.equal((await getPlayerStats('A', 'total', 'ALL_MODES', FAST_RETRY))?.status, 'error');
        freshSession();
        mockFetch(routes(profile200, () => new Response('', { status: 200 })));
        assert.equal((await getPlayerStats('B', 'total', 'ALL_MODES', FAST_RETRY))?.status, 'error');
    });

    it('leaderboard 400 with a valid profile → error', async () => {
        mockFetch(routes(profile200, () => empty(400)));
        assert.equal((await getPlayerStats('PlayerX', 'total', 'ALL_MODES', FAST_RETRY))?.status, 'error');
    });

    it('200 + leaderboard with entries → ok with correct ratios and profile info', async () => {
        mockFetch(routes(profile200, () => json(LEADERBOARD_OK)));
        const r = await getPlayerStats('playerx', 'total', 'ALL_MODES', FAST_RETRY);
        assert.ok(r && r.status === 'ok');
        assert.equal(r.username, 'PlayerX', 'display name comes from the profile');
        assert.equal(r.fkdr, 5);
        assert.equal(r.wlr, 5);
        assert.equal(r.kdr, 4);
        assert.equal(r.rank.text, 'TITAN');
        assert.equal(r.level, 42);
        assert.equal(r.guild, 'GuildOfPika');
        assert.equal(r.bowKills, 2);
        assert.equal(r.winstreak, 7);
        assert.ok(calls.some(c => c.url.endsWith('/profile/playerx')));
        assert.ok(calls.some(c => c.url.includes('/profile/playerx/leaderboard?type=bedwars&interval=total&mode=ALL_MODES')));
    });

    it('zero final deaths → fkdr equals final kills', async () => {
        mockFetch(routes(() => json(profileBody('Z')), () => json({ 'Final kills': { entries: [{ value: '7' }] } })));
        const r = await getPlayerStats('Z', 'total', 'ALL_MODES', FAST_RETRY);
        assert.ok(r && r.status === 'ok');
        assert.equal(r.fkdr, 7);
    });

    it('staff ranks given as object array map to rank display', async () => {
        mockFetch(routes(
            () => json(profileBody('StaffOne', { ranks: [{ name: 'MOD', displayName: 'Moderator' }] })),
            () => json(LEADERBOARD_OK),
        ));
        const r = await getPlayerStats('StaffOne', 'total', 'ALL_MODES', FAST_RETRY);
        assert.ok(r && r.status === 'ok');
        assert.equal(r.rank.text, 'MOD');
    });

    it('leaderboard 204 → api_off (private) with profile info', async () => {
        mockFetch(routes(profile200, () => empty(204)));
        const r = await getPlayerStats('PlayerX', 'weekly', 'SOLO', FAST_RETRY);
        assert.ok(r && r.status === 'api_off');
        assert.equal(r.level, 42);
        assert.equal(r.guild, 'GuildOfPika');
        assert.equal(r.rank.text, 'TITAN');
        assert.equal(callsTo('/leaderboard'), 1, 'private is certain: no lifetime follow-up');
    });

    it('all-null leaderboard on total/ALL_MODES → never_played', async () => {
        mockFetch(routes(profile200, () => json(LEADERBOARD_NULL)));
        const r = await getPlayerStats('PlayerX', 'total', 'ALL_MODES', FAST_RETRY);
        assert.ok(r && r.status === 'never_played');
        assert.equal(r.level, 42);
        assert.equal(callsTo('/leaderboard'), 1);
    });

    it('all-null weekly + total with data → no_data (profile fetched once)', async () => {
        mockFetch(routes(profile200, url => json(url.includes('interval=weekly') ? LEADERBOARD_NULL : LEADERBOARD_OK)));
        const r = await getPlayerStats('PlayerX', 'weekly', 'SOLO', FAST_RETRY);
        assert.ok(r && r.status === 'no_data');
        assert.equal(r.guild, 'GuildOfPika');
        assert.equal(calls.length, 3, 'profile + weekly board + total board');
        assert.equal(callsTo('/leaderboard?') - callsTo('interval=weekly'), 1);
    });

    it('all-null weekly + all-null total → never_played', async () => {
        mockFetch(routes(profile200, () => json(LEADERBOARD_NULL)));
        const r = await getPlayerStats('PlayerX', 'weekly', 'ALL_MODES', FAST_RETRY);
        assert.equal(r?.status, 'never_played');
    });

    it('all-null weekly + total 204 → api_off', async () => {
        mockFetch(routes(profile200, url => url.includes('interval=weekly') ? json(LEADERBOARD_NULL) : empty(204)));
        const r = await getPlayerStats('PlayerX', 'weekly', 'ALL_MODES', FAST_RETRY);
        assert.equal(r?.status, 'api_off');
    });

    it('all-null weekly + total request fails → error (never a guess)', async () => {
        mockFetch(routes(profile200, url => url.includes('interval=weekly') ? json(LEADERBOARD_NULL) : empty(500)));
        const r = await getPlayerStats('PlayerX', 'weekly', 'ALL_MODES', FAST_RETRY);
        assert.equal(r?.status, 'error');
    });
});

describe('getPlayerStats — caching and de-duplication', () => {
    beforeEach(() => freshSession());
    after(() => { cache.clear(); restoreFetch(); });

    it('repeated lookups of the same selection use the cache', async () => {
        mockFetch(routes(profile200, () => json(LEADERBOARD_OK)));
        await getPlayerStats('PlayerX', 'total', 'ALL_MODES', FAST_RETRY);
        await getPlayerStats('playerx', 'total', 'ALL_MODES', FAST_RETRY);
        assert.equal(calls.length, 2);
    });

    it('a period switch reuses the cached profile: one new request', async () => {
        mockFetch(routes(profile200, () => json(LEADERBOARD_OK)));
        await getPlayerStats('PlayerX', 'total', 'ALL_MODES', FAST_RETRY);
        await getPlayerStats('PlayerX', 'weekly', 'SOLO', FAST_RETRY);
        assert.equal(calls.length, 3);
        assert.equal(callsTo('/leaderboard'), 2);
    });

    it('error and rate_limited results are never cached', async () => {
        mockFetch(routes(profile200, () => empty(500)));
        await getPlayerStats('PlayerX', 'total', 'ALL_MODES', FAST_RETRY);
        mockFetch(routes(profile200, () => json(LEADERBOARD_OK)));
        const r = await getPlayerStats('PlayerX', 'total', 'ALL_MODES', FAST_RETRY);
        assert.equal(r?.status, 'ok');
    });

    it('concurrent identical lookups share one network round', async () => {
        mockFetch(routes(profile200, () => json(LEADERBOARD_OK)));
        const [a, b] = await Promise.all([
            getPlayerStats('PlayerX', 'total', 'ALL_MODES', FAST_RETRY),
            getPlayerStats('playerx', 'total', 'ALL_MODES', FAST_RETRY),
        ]);
        assert.equal(calls.length, 2);
        assert.deepEqual(a, b);
    });

    it('a key change during a lookup keeps its result out of the new session cache', async () => {
        mockFetch(routes(profile200, () => json(LEADERBOARD_OK)));
        const pending = getPlayerStats('PlayerX', 'total', 'ALL_MODES', FAST_RETRY);
        setApiKey('second-key');
        await pending;
        assert.equal(cache.getStats('PlayerX:total:ALL_MODES'), null);
    });
});
