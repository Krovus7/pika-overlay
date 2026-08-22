/**
 * API client tests — fetch is mocked on globalThis; retry delays are shrunk
 * via the optional retryOptions param so transient tests stay fast.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getPlayerStats } from '../src/main/api/apiClient';
import { cache } from '../src/main/api/cache';

const FAST_RETRY = { maxRetries: 2, baseDelayMs: 2, timeoutMs: 500 };

type MockResponder = (url: string, init?: RequestInit) => Promise<Response>;
let calls: string[] = [];

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), { status, headers });
}

function mockFetch(responder: MockResponder): void {
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
        calls.push(String(url));
        return responder(String(url), init);
    }) as typeof fetch;
}

const LEADERBOARD_OK = {
    'Final kills': { entries: [{ value: '10' }] },
    'Final deaths': { entries: [{ value: '2' }] },
    'Wins': { entries: [{ value: '5' }] },
    'Losses': { entries: [{ value: '1' }] },
    'Kills': { entries: [{ value: '40' }] },
    'Deaths': { entries: [{ value: '10' }] },
    'Beds destroyed': { entries: [{ value: '3' }] },
    'Highest winstreak reached': { entries: [{ value: '7' }] },
    'Games played': { entries: [{ value: '8' }] },
    'Bow kills': { entries: [{ value: '2' }] },
};

describe('getPlayerStats', () => {
    before(() => { cache.clear(); });
    after(() => {
        cache.clear();
        globalThis.fetch = undefined as unknown as typeof fetch;
    });

    it('returns null for empty username', async () => {
        assert.equal(await getPlayerStats('   '), null);
    });

    it('404 profile → nicked (🎭), never apiOff', async () => {
        calls = [];
        mockFetch(() => Promise.resolve(new Response('Not found', { status: 404 })));
        const r = await getPlayerStats('xXzRandomNick9182Xx', 'total', 'ALL_MODES', FAST_RETRY);
        assert.ok(r, 'should return a result');
        assert.equal(r.notFound, true);
        assert.equal(r.nicked, true);
        assert.ok(!r.apiOff, 'nicked must never be apiOff');
    });

    it('429 profile after retries → transient error, NOT nicked/notFound', async () => {
        calls = [];
        mockFetch(() => Promise.resolve(new Response('rate limited', { status: 429 })));
        const r = await getPlayerStats('SomePlayer', 'total', 'ALL_MODES', FAST_RETRY);
        assert.ok(r, 'should return a result');
        assert.equal(r.error, true);
        assert.equal(r.rateLimited, true);
        assert.ok(!r.notFound, 'transient errors must never be notFound');
        assert.ok(!r.nicked, 'transient errors must never be nicked');
        assert.equal(calls.length, 3, 'should retry maxRetries+1 times');
    });

    it('503 leaderboard after retries → transient error', async () => {
        calls = [];
        mockFetch(async url => {
            if (url.includes('/leaderboard')) return Promise.resolve(new Response('unavailable', { status: 503 }));
            return jsonResponse({ username: 'PlayerX', rank: { rankDisplay: '' }, ranks: [] });
        });
        const r = await getPlayerStats('PlayerX', 'total', 'ALL_MODES', FAST_RETRY);
        assert.ok(r, 'should return a result');
        assert.equal(r.error, true);
        assert.equal(r.rateLimited, true);
    });

    it('timeout (AbortError) → transient error result after retries', async () => {
        calls = [];
        mockFetch(() => {
            throw new DOMException('The operation was aborted.', 'AbortError');
        });
        const r = await getPlayerStats('SlowPlayer', 'total', 'ALL_MODES', FAST_RETRY);
        assert.ok(r, 'should return a result');
        assert.equal(r.error, true);
        assert.ok(!r.notFound, 'timeout must never be notFound');
    });

    it('200 profile + leaderboard → full stats with correct ratios', async () => {
        calls = [];
        mockFetch(async url => {
            if (url.includes('/leaderboard')) return jsonResponse(LEADERBOARD_OK);
            return jsonResponse({
                username: 'PlayerX',
                rank: { rankDisplay: 'TITAN', level: 42 },
                clan: { name: 'GuildOfPika' },
                ranks: [],
            });
        });
        const r = await getPlayerStats('PlayerX', 'total', 'ALL_MODES', FAST_RETRY);
        assert.ok(r, 'should return stats');
        assert.equal(r.notFound, false);
        assert.equal(r.nicked, false);
        assert.equal(r.apiOff, false);
        assert.equal(r.username, 'PlayerX');
        assert.equal(r.fkdr, 5, '10 finals / 2 final deaths = 5');
        assert.equal(r.wlr, 5, '5 wins / 1 loss = 5');
        assert.equal(r.kdr, 4, '40 kills / 10 deaths = 4');
        assert.equal(r.rank.text, 'TITAN');
        assert.equal(r.rank.color, '#ff5555');
        assert.equal(r.level, 42);
        assert.equal(r.guild, 'GuildOfPika');
        assert.equal(r.bowKills, 2);
        assert.equal(r.winstreak, 7);
        assert.ok(calls[0]!.includes('/profile/PlayerX'), 'first call is the profile');
        assert.ok(calls[1]!.includes('type=bedwars&interval=total&mode=ALL_MODES'), 'leaderboard URL carries interval+mode');
    });

    it('zero final deaths → fkdr equals final kills (no division by zero)', async () => {
        mockFetch(async url => {
            if (url.includes('/leaderboard')) return jsonResponse({ 'Final kills': { entries: [{ value: '7' }] } });
            return jsonResponse({ username: 'ZeroDeaths', rank: {}, ranks: [] });
        });
        const r = await getPlayerStats('ZeroDeaths', 'total', 'ALL_MODES', FAST_RETRY);
        assert.ok(r, 'should return stats');
        assert.equal(r.fkdr, 7);
    });

    it('200 profile with empty leaderboard → api-off (🔒), not nicked', async () => {
        mockFetch(async url => {
            if (url.includes('/leaderboard')) return jsonResponse({});
            return jsonResponse({ username: 'Jeb_', rank: { level: 9 }, ranks: [] });
        });
        const r = await getPlayerStats('Jeb_', 'total', 'ALL_MODES', FAST_RETRY);
        assert.ok(r, 'should return a result');
        assert.equal(r.notFound, true);
        assert.equal(r.nicked, false);
        assert.equal(r.apiOff, true);
    });

    it('200 profile with empty leaderboard body → api-off', async () => {
        mockFetch(async url => {
            if (url.includes('/leaderboard')) return new Response('', { status: 200 });
            return jsonResponse({ username: 'Ace', rank: {}, ranks: [] });
        });
        const r = await getPlayerStats('Ace', 'total', 'ALL_MODES', FAST_RETRY);
        assert.ok(r, 'should return a result');
        assert.equal(r.apiOff, true);
        assert.equal(r.nicked, false);
    });

    it('invalid interval/mode fall back to total/ALL_MODES in the URL and cache key', async () => {
        calls = [];
        mockFetch(async url => {
            if (url.includes('/leaderboard')) return jsonResponse(LEADERBOARD_OK);
            return jsonResponse({ username: 'ModeCheck', rank: {}, ranks: [] });
        });
        const r = await getPlayerStats('ModeCheck', 'hourly', 'SQUADS', FAST_RETRY);
        assert.ok(r, 'should return stats');
        assert.ok(calls[1]!.includes('interval=total&mode=ALL_MODES'));
    });

    it('cache serves repeated lookups without new network calls', async () => {
        calls = [];
        mockFetch(async url => {
            if (url.includes('/leaderboard')) return jsonResponse(LEADERBOARD_OK);
            return jsonResponse({ username: 'CachedOne', rank: {}, ranks: [] });
        });
        await getPlayerStats('CachedOne', 'total', 'ALL_MODES', FAST_RETRY);
        await getPlayerStats('CachedOne', 'total', 'ALL_MODES', FAST_RETRY);
        assert.equal(calls.length, 2, 'second call must hit the cache');
    });

    it('cache key separates interval and mode', async () => {
        calls = [];
        mockFetch(async url => {
            if (url.includes('/leaderboard')) return jsonResponse(LEADERBOARD_OK);
            return jsonResponse({ username: 'Multi', rank: {}, ranks: [] });
        });
        await getPlayerStats('Multi', 'weekly', 'SOLO', FAST_RETRY);
        await getPlayerStats('Multi', 'monthly', 'QUAD', FAST_RETRY);
        assert.equal(calls.length, 4, 'different interval+mode must re-fetch');
    });

    it('ranks as object array (modern API) map to staff rank display', async () => {
        mockFetch(async url => {
            if (url.includes('/leaderboard')) return jsonResponse(LEADERBOARD_OK);
            return jsonResponse({
                username: 'StaffOne',
                rank: { rankDisplay: '' },
                ranks: [{ name: 'MOD', displayName: 'Moderator' }],
            });
        });
        const r = await getPlayerStats('StaffOne', 'total', 'ALL_MODES', FAST_RETRY);
        assert.ok(r, 'should return stats');
        assert.equal(r.rank.text, 'MOD');
        assert.equal(r.rank.color, '#00aa00');
    });
});
