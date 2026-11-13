/**
 * Fresh lookups (own row and party): the cache is skipped for that player
 * only, a row that already shows a result is updated without a loading state,
 * and a failed refresh leaves it untouched.
 */

import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { BrowserWindow } from 'electron';

import { getPlayerStats } from '../src/main/api/apiClient';
import { cache } from '../src/main/api/cache';
import type { ConfigStore } from '../src/main/config';
import { LookupService, type LookupDeps } from '../src/main/ipc/lookup';
import { PlayerRegistry } from '../src/main/state';
import { FAST_RETRY, LEADERBOARD_OK, calls, empty, freshSession, json, mockFetch, profileBody, restoreFetch, routes } from './apiMock';

after(() => restoreFetch());

const okRoutes = () => routes(json(profileBody('Any')), () => json(LEADERBOARD_OK));

function makeService() {
    const sent: string[] = [];
    const win = { webContents: { send: (channel: string, payload: { status?: string }) => sent.push(payload.status ? `${channel}:${payload.status}` : channel) } };
    const store = { get: (k: string) => ({ statsInterval: 'total', statsMode: 'ALL_MODES' } as Record<string, string>)[k] };
    const deps: LookupDeps = {
        store: store as unknown as ConfigStore,
        registry: new PlayerRegistry(),
        getOverlayWin: () => win as unknown as BrowserWindow,
    };
    return { service: new LookupService(deps, [1, 1]), sent, registry: deps.registry };
}

describe('ApiCache.forget', () => {
    beforeEach(() => freshSession());

    it('drops one player in every period and mode, and nobody else', async () => {
        mockFetch(okRoutes());
        await getPlayerStats('Friend', 'total', 'ALL_MODES', FAST_RETRY);
        await getPlayerStats('Friend', 'weekly', 'SOLO', FAST_RETRY);
        await getPlayerStats('Friendly', 'total', 'ALL_MODES', FAST_RETRY);
        const before = calls.length;

        cache.forget('FRIEND');
        await getPlayerStats('Friendly', 'total', 'ALL_MODES', FAST_RETRY);
        assert.equal(calls.length, before, 'a name that merely starts the same stays cached');
        await getPlayerStats('Friend', 'total', 'ALL_MODES', FAST_RETRY);
        await getPlayerStats('Friend', 'weekly', 'SOLO', FAST_RETRY);
        assert.equal(calls.length, before + 3, 'profile once + both leaderboards again');
    });
});

describe('LookupService — fresh lookups', () => {
    beforeEach(() => freshSession());

    it('a plain lookup is served from the cache, a fresh one asks the API', async () => {
        mockFetch(okRoutes());
        const { service, registry } = makeService();
        await service.lookup('Friend', 'party', null, null);
        const afterFirst = calls.length;

        registry.delete('friend');
        await service.lookup('Friend', 'party', null, null);
        assert.equal(calls.length, afterFirst, 'cached');

        registry.delete('friend');
        await service.lookup('Friend', 'party', null, null, true);
        assert.equal(calls.length, afterFirst + 2, 'profile + leaderboard fetched again');
    });

    it('a fresh refresh of a shown row is quiet: no loading state, one new result', async () => {
        mockFetch(okRoutes());
        const { service, sent } = makeService();
        await service.lookup('Friend', 'party', null, null);
        sent.length = 0;

        await service.refresh('Friend', null, null, true);
        assert.deepEqual(sent, ['player:stats:ok']);
    });

    it('a failed quiet refresh leaves the row alone and is not retried', async () => {
        mockFetch(okRoutes());
        const { service, sent } = makeService();
        await service.lookup('Friend', 'party', null, null);
        sent.length = 0;

        mockFetch(() => empty(500));
        const result = await service.refresh('Friend', null, null, true);
        assert.equal(result?.status, 'error');
        await new Promise(resolve => setTimeout(resolve, 30));
        assert.deepEqual(sent, [], 'the previous stats stay on screen');
    });

    it('a row without a result yet (or a period switch) still shows the loading state', async () => {
        mockFetch(() => empty(500));
        const { service, sent } = makeService();
        await service.lookup('Friend', 'party', null, null);
        mockFetch(okRoutes());
        sent.length = 0;
        await service.refresh('Friend', null, null, true);
        assert.deepEqual(sent.slice(0, 2), ['player:loading', 'player:stats:ok']);

        sent.length = 0;
        await service.refresh('Friend', 'weekly', null, true);
        assert.equal(sent[0], 'player:loading', 'another period is not an in-place update');
    });
});
