/**
 * Lookup layer: nicked mapping by source, refresh (source preserved), race
 * guards, queue-based refresh-all and the automatic retry bounds.
 */

import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { BrowserWindow } from 'electron';

import { AutoRetry } from '../src/main/ipc/autoRetry';
import { LookupService, applySource, type LookupDeps } from '../src/main/ipc/lookup';
import { PlayerRegistry, type LookupJob, type LookupQueue } from '../src/main/state';
import type { ConfigStore } from '../src/main/config';
import type { PlayerResult } from '../src/shared/types';
import {
    LEADERBOARD_OK, calls, empty, freshSession, json, mockFetch, profileBody, restoreFetch, routes,
} from './apiMock';

interface Sent { channel: string; payload: Record<string, unknown> }

function makeDeps() {
    const sent: Sent[] = [];
    const win = { webContents: { send: (channel: string, payload: Record<string, unknown>) => sent.push({ channel, payload }) } };
    const store = { get: (k: string) => ({ statsInterval: 'total', statsMode: 'ALL_MODES' } as Record<string, string>)[k] };
    const deps: LookupDeps = {
        store: store as unknown as ConfigStore,
        registry: new PlayerRegistry(),
        getOverlayWin: () => win as unknown as BrowserWindow,
    };
    return { deps, sent };
}

const statsEvents = (sent: Sent[]) => sent.filter(s => s.channel === 'player:stats').map(s => s.payload);
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
async function waitFor(cond: () => boolean): Promise<void> {
    for (let i = 0; i < 400 && !cond(); i++) await wait(5);
    assert.ok(cond(), 'condition not met within timeout');
}

describe('applySource', () => {
    const notFound: PlayerResult = { username: 'x', status: 'not_found' };

    it('not_found from a live-game source becomes nicked', () => {
        for (const source of ['tab_list', 'join', 'kill_feed', 'bed_break', 'team_announce', 'party']) {
            assert.deepEqual(applySource(notFound, source), { username: 'x', status: 'nicked' }, source);
        }
    });

    it('not_found typed by the user stays not_found', () => {
        assert.deepEqual(applySource(notFound, 'manual'), notFound);
        assert.deepEqual(applySource(notFound, 'bulk'), notFound);
    });

    it('other statuses are untouched', () => {
        const err: PlayerResult = { username: 'x', status: 'error' };
        assert.equal(applySource(err, 'join'), err);
    });
});

describe('LookupService', () => {
    beforeEach(() => freshSession());
    after(() => restoreFetch());

    it('sends loading then one stats event with the source; unknown name from a game is nicked', async () => {
        mockFetch(routes(() => empty(404), () => empty(400)));
        const { deps, sent } = makeDeps();
        const service = new LookupService(deps);
        await service.lookup('Sneaky', 'join', null, null);

        assert.deepEqual(sent.map(s => s.channel), ['player:loading', 'player:stats']);
        assert.deepEqual(sent[0]!.payload, { username: 'Sneaky', source: 'join' });
        assert.deepEqual(sent[1]!.payload, { username: 'Sneaky', status: 'nicked', source: 'join' });
    });

    it('the same unknown name typed by the user is not_found', async () => {
        mockFetch(routes(() => empty(404), () => empty(400)));
        const { deps, sent } = makeDeps();
        const service = new LookupService(deps);
        await service.lookup('Typo', 'manual', null, null);
        assert.equal(statsEvents(sent)[0]!.status, 'not_found');
    });

    it('registry dedupe: a second lookup of a registered player does nothing', async () => {
        mockFetch(routes(() => json(profileBody('Dream')), () => json(LEADERBOARD_OK)));
        const { deps, sent } = makeDeps();
        const service = new LookupService(deps);
        await service.lookup('Dream', 'join', null, null);
        assert.equal(await service.lookup('dream', 'manual', null, null), null);
        assert.equal(statsEvents(sent).length, 1);
    });

    it('refresh keeps the original name and source, sends loading first, no dedupe', async () => {
        mockFetch(routes(() => json(profileBody('Dream')), () => json(LEADERBOARD_OK)));
        const { deps, sent } = makeDeps();
        const service = new LookupService(deps);
        await service.lookup('Dream', 'kill_feed', null, null);
        sent.length = 0;

        await service.refresh('dream', 'weekly', 'SOLO');
        assert.deepEqual(sent.map(s => s.channel), ['player:loading', 'player:stats']);
        assert.deepEqual(sent[0]!.payload, { username: 'Dream', source: 'kill_feed' });
        assert.equal(sent[1]!.payload.source, 'kill_feed');
        assert.deepEqual(deps.registry.get('dream'), { name: 'Dream', source: 'kill_feed' });
        assert.ok(calls.some(c => c.url.includes('interval=weekly&mode=SOLO')));
    });

    it('a refreshed unknown name keeps its source-based label (nicked stays nicked)', async () => {
        mockFetch(routes(() => empty(404), () => empty(400)));
        const { deps, sent } = makeDeps();
        const service = new LookupService(deps);
        await service.lookup('Sneaky', 'tab_list', null, null);
        await service.refresh('sneaky');
        assert.deepEqual(statsEvents(sent).map(e => e.status), ['nicked', 'nicked']);
    });

    it('refresh of an unregistered player does nothing', async () => {
        mockFetch(() => { throw new Error('no network expected'); });
        const { deps, sent } = makeDeps();
        assert.equal(await new LookupService(deps).refresh('ghost'), null);
        assert.equal(sent.length, 0);
    });

    it('race guard: a player removed while the request is in flight is discarded', async () => {
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        mockFetch(async url => {
            await gate;
            return url.includes('/leaderboard') ? json(LEADERBOARD_OK) : json(profileBody('Quitter'));
        });
        const { deps, sent } = makeDeps();
        const service = new LookupService(deps);
        const pending = service.lookup('Quitter', 'join', null, null);
        deps.registry.delete('quitter');
        release();
        assert.equal(await pending, null);
        assert.equal(statsEvents(sent).length, 0);
    });

    it('a superseded run (newer refresh for the same player) is discarded', async () => {
        const { deps, sent } = makeDeps();
        const service = new LookupService(deps);
        mockFetch(routes(() => json(profileBody('Dream')), () => json(LEADERBOARD_OK)));
        await service.lookup('Dream', 'join', null, null);
        sent.length = 0;

        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        mockFetch(async url => {
            if (url.includes('interval=weekly')) await gate;
            return url.includes('/leaderboard') ? json(LEADERBOARD_OK) : json(profileBody('Dream'));
        });

        const first = service.refresh('dream', 'weekly', 'ALL_MODES');
        const second = service.refresh('dream', 'monthly', 'ALL_MODES');
        release();
        assert.equal(await first, null, 'older run discarded');
        assert.equal((await second)?.status, 'ok');
        assert.equal(statsEvents(sent).length, 1);
    });

    it('refreshAll queues every registered player with its own source and explicit interval/mode', () => {
        const { deps } = makeDeps();
        deps.registry.add('A', 'join');
        deps.registry.add('B', 'bulk');
        const jobs: LookupJob[] = [];
        const queue = { enqueue: (j: LookupJob) => jobs.push(j) } as unknown as LookupQueue;
        new LookupService(deps).refreshAll(queue, 'weekly', 'DOUBLES');
        assert.deepEqual(jobs, [
            { username: 'A', source: 'join', interval: 'weekly', mode: 'DOUBLES', refresh: true },
            { username: 'B', source: 'bulk', interval: 'weekly', mode: 'DOUBLES', refresh: true },
        ]);
    });

    it('automatic retry: an error row is retried twice more, then left alone', async () => {
        mockFetch(routes(() => json(profileBody('Flaky')), () => empty(500)));
        const { deps, sent } = makeDeps();
        const service = new LookupService(deps, [5, 10]);
        await service.lookup('Flaky', 'join', null, null);
        await waitFor(() => statsEvents(sent).length === 3);
        await wait(60);
        assert.deepEqual(statsEvents(sent).map(e => e.status), ['error', 'error', 'error']);
    });

    it('automatic retry recovers silently once the API answers', async () => {
        let healthy = false;
        mockFetch(routes(() => json(profileBody('Flaky')), () => (healthy ? json(LEADERBOARD_OK) : empty(500))));
        const { deps, sent } = makeDeps();
        const service = new LookupService(deps, [5, 10]);
        await service.lookup('Flaky', 'join', null, null);
        healthy = true;
        await waitFor(() => statsEvents(sent).some(e => e.status === 'ok'));
        await wait(40);
        assert.deepEqual(statsEvents(sent).map(e => e.status), ['error', 'ok']);
    });

    it('lookup:retry restarts the automatic-retry budget', async () => {
        mockFetch(routes(() => json(profileBody('Flaky')), () => empty(500)));
        const { deps, sent } = makeDeps();
        const service = new LookupService(deps, [5]);
        await service.lookup('Flaky', 'join', null, null);
        await waitFor(() => statsEvents(sent).length === 2);
        await service.retry('flaky');
        await waitFor(() => statsEvents(sent).length === 4);
    });
});

describe('AutoRetry', () => {
    function make(opts: { eligible?: () => boolean; retryAt?: () => number | null; now?: () => number } = {}) {
        const runs: string[] = [];
        const retry = new AutoRetry({
            delaysMs: [5, 10],
            isEligible: opts.eligible ?? (() => true),
            run: key => runs.push(key),
            retryAt: opts.retryAt,
            now: opts.now,
        });
        return { retry, runs };
    }

    it('schedules at most delays.length retries per player', async () => {
        const { retry, runs } = make();
        retry.onResult('a', 'error');
        await wait(30);
        retry.onResult('a', 'error');
        await wait(30);
        retry.onResult('a', 'error');
        await wait(30);
        assert.deepEqual(runs, ['a', 'a']);
    });

    it('a good result resets the counter and cancels a pending retry', async () => {
        const { retry, runs } = make();
        retry.onResult('a', 'error');
        retry.onResult('a', 'ok');
        await wait(20);
        assert.deepEqual(runs, []);
        retry.onResult('a', 'rate_limited');
        await wait(20);
        assert.deepEqual(runs, ['a']);
    });

    it('does not run when the player is no longer eligible (removed / key problem)', async () => {
        const { retry, runs } = make({ eligible: () => false });
        retry.onResult('a', 'error');
        await wait(20);
        assert.deepEqual(runs, []);
    });

    it('rate_limited waits for retryAt when it is later than the backoff', async () => {
        const now = 1_000;
        const { retry, runs } = make({ retryAt: () => now + 40, now: () => now });
        retry.onResult('a', 'rate_limited');
        await wait(20);
        assert.deepEqual(runs, [], 'backoff alone (5 ms) would already have fired');
        await waitFor(() => runs.length === 1);
    });

    it('auth / not_found style results never retry; reset() cancels', async () => {
        const { retry, runs } = make();
        retry.onResult('a', 'auth');
        retry.onResult('b', 'not_found');
        retry.onResult('c', 'error');
        retry.reset('c');
        await wait(20);
        assert.deepEqual(runs, []);
    });
});
