/**
 * Deterministic fake Pika API (facts from docs/API-CLIENT.md). Replaces
 * globalThis.fetch; all delays use the (mocked) setTimeout so latency runs at
 * true virtual scale. Ground truth per name comes from a seeded hash.
 */

import { mulberry32, unit } from './util.mjs';

export const API_KEY = 'sim-fake-key';
const LIMIT = 120;
const WINDOW_MS = 60_000;

export function classOf(name, seed, alwaysOk) {
    const lower = name.toLowerCase();
    if (alwaysOk.has(lower)) return 'ok';
    const u = unit(lower, seed);
    if (u < 0.08) return 'unknown';
    if (u < 0.14) return 'private';
    if (u < 0.18) return 'never_played';
    return 'ok';
}

/** Non-lifetime views: ~40 % of ok names have no games in the interval */
export const nullForInterval = (name, interval, seed) =>
    interval !== 'total' && unit(`${name.toLowerCase()}|${interval}`, seed + 7) < 0.4;

const STAT_KEYS = ['Final kills', 'Final deaths', 'Wins', 'Losses', 'Kills', 'Deaths',
    'Beds destroyed', 'Highest winstreak reached', 'Games played', 'Bow kills'];

export class FakeApi {
    constructor({ seed = 1, alwaysOk = [], breakApi = false } = {}) {
        this.seed = seed;
        this.alwaysOk = new Set(alwaysOk.map(n => n.toLowerCase()));
        this.breakApi = breakApi;
        this.rand = mulberry32(seed * 7919 + 13);
        this.inflight = 0;
        this.times = [];
        this.winCounts = new Map();
        this.faultNames = new Set();
        this.c = { total: 0, profile: 0, leaderboard: 0, s401: 0, s429: 0, s500: 0, hung: 0, aborted: 0 };
        this.t0 = Date.now();
    }

    install() {
        globalThis.fetch = (url, init) => this.handle(String(url), init);
    }

    classOf(name) { return classOf(name, this.seed, this.alwaysOk); }

    handle(url, init) {
        return new Promise((resolve, reject) => {
            const now = Date.now();
            const u = new URL(url);
            const m = /\/profile\/([^/]+)(\/leaderboard)?$/.exec(u.pathname);
            const name = m ? decodeURIComponent(m[1]) : '';
            const isBoard = !!(m && m[2]);
            const key = new Headers(init?.headers).get('x-api-key');
            this.inflight++;
            let settled = false;
            const done = fn => { if (!settled) { settled = true; this.inflight--; fn(); } };
            const signal = init?.signal;
            const onAbort = () => done(() => {
                this.c.aborted++;
                reject(new DOMException('This operation was aborted', 'AbortError'));
            });
            if (signal?.aborted) return onAbort();
            signal?.addEventListener('abort', onAbort, { once: true });

            this.onRequest?.(name.toLowerCase());
            this.c.total++;
            this.c[isBoard ? 'leaderboard' : 'profile']++;
            let latency = this.latency();
            let spec;
            if (key !== API_KEY) {
                this.c.s401++;
                spec = { status: 401, body: '{"error":"invalid api key"}' };
            } else {
                this.times.push(now);
                const win = Math.floor((now - this.t0) / WINDOW_MS);
                const count = (this.winCounts.get(win) ?? 0) + 1;
                this.winCounts.set(win, count);
                const resetSec = Math.max(1, Math.ceil(((win + 1) * WINDOW_MS + this.t0 - now) / 1000));
                const rl = {
                    'x-ratelimit-limit': String(LIMIT),
                    'x-ratelimit-remaining': String(Math.max(0, LIMIT - count)),
                    'x-ratelimit-reset': String(resetSec),
                };
                if (count > LIMIT) {
                    this.c.s429++;
                    spec = { status: 429, headers: { ...rl, 'retry-after': String(resetSec) } };
                } else {
                    const f = this.rand();
                    if (f < 0.003) {
                        this.c.hung++;
                        this.faultNames.add(name.toLowerCase());
                        return; // never answers; only the client's abort ends it
                    }
                    if (f < 0.008) {
                        this.c.s500++;
                        this.faultNames.add(name.toLowerCase());
                        spec = { status: 500, headers: rl };
                    } else {
                        if (f < 0.038) latency = 1500 + this.rand() * 2500;
                        spec = this.answer(name, isBoard, u.searchParams.get('interval') ?? 'total');
                        spec.headers = { ...spec.headers, ...rl };
                    }
                }
            }
            setTimeout(() => done(() => {
                signal?.removeEventListener('abort', onAbort);
                resolve(new Response(spec.body ?? null, { status: spec.status, headers: spec.headers }));
            }), Math.round(latency));
        });
    }

    latency() {
        return 120 + this.rand() * 330;
    }

    answer(name, isBoard, interval) {
        const json = { 'content-type': 'application/json' };
        const cls = this.classOf(name);
        if (cls === 'unknown') return { status: isBoard ? 400 : 404 };
        if (!isBoard) {
            const lvl = 1 + Math.floor(unit(name, this.seed + 3) * 90);
            return { status: 200, headers: json, body: JSON.stringify({ username: name, rank: { rankDisplay: '', level: lvl }, ranks: [], clan: { name: 'Guild' } }) };
        }
        if (cls === 'private') return { status: 204 };
        const empty = cls === 'never_played' || nullForInterval(name, interval, this.seed);
        if (this.breakApi) return { status: 204 };
        const body = {};
        STAT_KEYS.forEach((k, i) => {
            const v = Math.floor(unit(`${name.toLowerCase()}|${k}`, this.seed + 11) * (i < 2 ? 3000 : 800));
            body[k] = { metadata: { total: 1 }, entries: empty ? null : [{ place: 1, value: String(v), id: name }] };
        });
        return { status: 200, headers: json, body: JSON.stringify(body) };
    }

    /** Most requests that fell into any sliding 60 s span */
    maxSliding() {
        let max = 0;
        for (let i = 0, j = 0; i < this.times.length; i++) {
            while (this.times[i] - this.times[j] >= WINDOW_MS) j++;
            max = Math.max(max, i - j + 1);
        }
        return max;
    }

    stats() {
        return { ...this.c, maxSliding60s: this.maxSliding(), faultNames: this.faultNames.size };
    }
}
