/**
 * Rate limiter (injected virtual clock), health tracker, cache TTLs and the
 * key test. No real timers or network.
 */

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { setApiKey } from '../src/main/api/apiSession';
import { ApiCache } from '../src/main/api/cache';
import { getHealth, HealthTracker } from '../src/main/api/health';
import { testApiKey } from '../src/main/api/keyTest';
import { RateLimiter, readRateHeaders, type Clock } from '../src/main/api/rateLimiter';
import type { PlayerResult } from '../src/shared/types';
import { calls, empty, freshSession, json, mockFetch, restoreFetch } from './apiMock';

/** Virtual time: sleep advances the clock and fires due timers */
class FakeClock implements Clock {
    t = 1_000_000;
    private timers: Array<{ at: number; cb: () => void }> = [];
    now = () => this.t;
    sleep = (ms: number) => { this.advance(ms); return Promise.resolve(); };
    after = (ms: number, cb: () => void) => { this.timers.push({ at: this.t + ms, cb }); };
    advance(ms: number): void {
        this.t += ms;
        const due = this.timers.filter(x => x.at <= this.t);
        this.timers = this.timers.filter(x => x.at > this.t);
        due.forEach(x => x.cb());
    }
}

function setup() {
    const clock = new FakeClock();
    const limiter = new RateLimiter(clock);
    const pauses: Array<number | null> = [];
    limiter.onPauseChange(p => pauses.push(p));
    return { clock, limiter, pauses };
}

describe('RateLimiter', () => {
    it('sends freely while budget remains', async () => {
        const { clock, limiter } = setup();
        limiter.observe({ limit: 120, remaining: 100, resetSec: 30 });
        const start = clock.t;
        (await limiter.acquire())();
        assert.equal(clock.t, start, 'no waiting');
    });

    it('budget exhausted (reserve of 1) waits until the window resets', async () => {
        const { clock, limiter, pauses } = setup();
        limiter.observe({ limit: 120, remaining: 1, resetSec: 20 });
        const start = clock.t;
        const release = await limiter.acquire();
        assert.equal(clock.t - start, 20_000, 'waited for the reset instead of sending');
        assert.deepEqual(pauses, [start + 20_000, null], 'paused with retryAt, then resumed');
        release();
    });

    it('budget is restored to the window limit after the reset', async () => {
        const { clock, limiter } = setup();
        limiter.observe({ limit: 5, remaining: 0, resetSec: 10 });
        (await limiter.acquire())();
        const afterWait = clock.t;
        (await limiter.acquire())();
        assert.equal(clock.t, afterWait, 'second request in the new window is not delayed');
    });

    it('requests in flight count against the budget', async () => {
        const { clock, limiter } = setup();
        limiter.observe({ limit: 120, remaining: 3, resetSec: 15 });
        const start = clock.t;
        const r1 = await limiter.acquire();
        assert.equal(clock.t, start);
        const r2 = await limiter.acquire();
        assert.equal(clock.t, start, '3 - 1 in flight > reserve');
        const r3 = await limiter.acquire();
        assert.equal(clock.t - start, 15_000, '3 - 2 in flight hits the reserve → wait');
        [r1, r2, r3].forEach(r => r());
    });

    it('out-of-order responses never raise the remaining budget within a window', async () => {
        const { clock, limiter } = setup();
        limiter.observe({ limit: 120, remaining: 1, resetSec: 10 });
        limiter.observe({ limit: 120, remaining: 50, resetSec: 10 });
        const start = clock.t;
        (await limiter.acquire())();
        assert.equal(clock.t - start, 10_000);
    });

    it('429 pause blocks every request and reports retryAt, then clears', async () => {
        const { clock, limiter, pauses } = setup();
        const start = clock.t;
        limiter.pauseFor(7_000);
        assert.deepEqual(pauses, [start + 7_000]);
        (await limiter.acquire())();
        assert.equal(clock.t - start, 7_000);
        assert.deepEqual(pauses, [start + 7_000, null]);
    });

    it('a pause with no waiting request still clears itself when it ends', () => {
        const { clock, limiter, pauses } = setup();
        const start = clock.t;
        limiter.pauseFor(3_000);
        clock.advance(3_000);
        assert.deepEqual(pauses, [start + 3_000, null]);
    });

    it('reset() forgets budget and pause', async () => {
        const { clock, limiter } = setup();
        limiter.observe({ limit: 120, remaining: 0, resetSec: 30 });
        limiter.pauseFor(30_000);
        limiter.reset();
        const start = clock.t;
        (await limiter.acquire())();
        assert.equal(clock.t, start);
    });

    it('readRateHeaders parses the Pika headers and ignores junk', () => {
        const h = readRateHeaders(new Headers({
            'x-ratelimit-limit': '120', 'x-ratelimit-remaining': '7',
            'x-ratelimit-reset': '42', 'retry-after': 'soon',
        }));
        assert.deepEqual(h, { limit: 120, remaining: 7, resetSec: 42, retryAfterSec: undefined });
    });
});

describe('HealthTracker', () => {
    it('combines key, pause and reachability with the right precedence, emitting only on change', () => {
        const h = new HealthTracker();
        const seen: string[] = [];
        h.onChange(v => seen.push(v.kind));
        assert.equal(h.get().kind, 'key_missing');

        h.setKeyStatus('ok');
        h.setUnreachable(true);
        h.setPausedUntil(5_000);
        assert.deepEqual(h.get(), { kind: 'rate_limited', retryAt: 5_000 });
        h.setPausedUntil(null);
        assert.equal(h.get().kind, 'unreachable');
        h.setUnreachable(false);
        h.setUnreachable(false);
        h.setKeyStatus('key_invalid');
        assert.equal(h.isAuthBlocked(), true);
        assert.deepEqual(seen, ['ok', 'unreachable', 'rate_limited', 'unreachable', 'ok', 'key_invalid']);
    });
});

describe('ApiCache TTLs', () => {
    const okResult = { username: 'a', status: 'ok' } as unknown as PlayerResult;
    const info = { rank: { text: '', color: '#aaa' }, level: null, guild: null };

    it('ok stats live 10 min; api_off / never_played / no_data 3 min; others never stored', () => {
        let now = 0;
        const c = new ApiCache(() => now);
        c.setStats('ok', okResult);
        for (const status of ['api_off', 'never_played', 'no_data'] as const) {
            c.setStats(status, { username: 'a', status, ...info });
        }
        for (const status of ['error', 'rate_limited', 'auth'] as const) {
            c.setStats(status, { username: 'a', status });
        }
        now = 3 * 60_000 - 1;
        assert.ok(c.getStats('api_off') && c.getStats('never_played') && c.getStats('no_data'));
        assert.equal(c.getStats('error'), null);
        assert.equal(c.getStats('rate_limited'), null);
        assert.equal(c.getStats('auth'), null);
        now = 3 * 60_000;
        assert.equal(c.getStats('api_off'), null);
        assert.ok(c.getStats('ok'));
        now = 10 * 60_000;
        assert.equal(c.getStats('ok'), null);
    });

    it('profiles live 10 min, a 404 only 3 min', () => {
        let now = 0;
        const c = new ApiCache(() => now);
        c.setProfile('A', { kind: 'ok', body: { username: 'A' } });
        c.setProfile('B', { kind: 'not_found' });
        now = 3 * 60_000;
        assert.ok(c.getProfile('a'));
        assert.equal(c.getProfile('b'), null);
        now = 10 * 60_000;
        assert.equal(c.getProfile('a'), null);
    });

    it('clear() empties everything and bumps the generation', () => {
        const c = new ApiCache();
        c.setStats('k', okResult);
        const gen = c.generation;
        c.clear();
        assert.equal(c.getStats('k'), null);
        assert.notEqual(c.generation, gen);
    });
});

describe('testApiKey', () => {
    afterEach(() => restoreFetch());

    it('empty key → missing, without a request', async () => {
        freshSession();
        mockFetch(() => json({}));
        assert.deepEqual(await testApiKey('  '), { ok: false, reason: 'missing' });
        assert.equal(calls.length, 0);
    });

    it('sends the tested key (not the saved one) in a single request', async () => {
        freshSession('saved-key');
        mockFetch(() => json({ username: 'Notch' }));
        assert.deepEqual(await testApiKey(' candidate '), { ok: true, reason: 'ok' });
        assert.equal(calls.length, 1);
        assert.equal(calls[0]!.key, 'candidate');
    });

    it('maps 401 → invalid, 429 → rate_limited, 404 → ok, 403/5xx/network → unreachable', async () => {
        freshSession();
        mockFetch(() => json({ error: 'invalid api key' }, 401));
        assert.equal((await testApiKey('k')).reason, 'invalid');
        mockFetch(() => empty(403));
        assert.equal((await testApiKey('k')).reason, 'unreachable');
        mockFetch(() => empty(429));
        assert.equal((await testApiKey('k')).reason, 'rate_limited');
        mockFetch(() => empty(404));
        assert.deepEqual(await testApiKey('k'), { ok: true, reason: 'ok' });
        mockFetch(() => empty(502));
        assert.equal((await testApiKey('k')).reason, 'unreachable');
        mockFetch(() => { throw new TypeError('fetch failed'); });
        assert.equal((await testApiKey('k')).reason, 'unreachable');
    });

    it('never touches the saved key or the global health', async () => {
        freshSession('saved-key');
        mockFetch(() => empty(401));
        await testApiKey('bad');
        assert.equal(getHealth().kind, 'ok');
        mockFetch(() => { throw new TypeError('down'); });
        await testApiKey('bad');
        assert.equal(getHealth().kind, 'ok');
        setApiKey('');
    });
});
