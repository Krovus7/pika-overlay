/**
 * Shared helpers for API tests: a fetch mock that records calls, canned
 * payloads and a clean API session.
 */

import { setApiKey } from '../src/main/api/apiSession';
import { cache } from '../src/main/api/cache';

export const FAST_RETRY = { maxRetries: 2, baseDelayMs: 2, timeoutMs: 500 };

export interface RecordedCall {
    url: string;
    key: string | null;
}

export type Responder = (url: string) => Response | Promise<Response>;

export const calls: RecordedCall[] = [];

export function mockFetch(responder: Responder): void {
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        calls.push({ url: String(url), key: headers.get('x-api-key') });
        return responder(String(url));
    }) as typeof fetch;
}

export function restoreFetch(): void {
    globalThis.fetch = undefined as unknown as typeof fetch;
}

/** Fresh session: empty caches, `key` configured, health ok, no recorded calls */
export function freshSession(key = 'test-key'): void {
    setApiKey('');
    setApiKey(key);
    cache.clear();
    calls.length = 0;
}

export const callsTo = (fragment: string): number => calls.filter(c => c.url.includes(fragment)).length;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), { status, headers });
}

export const empty = (status: number): Response => new Response(null, { status });

export const LEADERBOARD_OK = {
    'Final kills': { metadata: { total: 1 }, entries: [{ place: 1, value: '10', id: 'x' }] },
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

/** What Pika returns for a public player without data in the selected view */
export const LEADERBOARD_NULL = {
    'Final kills': { metadata: { total: 1 }, entries: null },
    'Wins': { metadata: { total: 1 }, entries: null },
    'Bow kills': { metadata: { total: 1 }, entries: null },
};

export const profileBody = (username: string, extra: Record<string, unknown> = {}) =>
    ({ username, rank: { rankDisplay: '', level: 12 }, ranks: [], clan: { name: 'Guild' }, ...extra });

/** Responder: profile → 200 body, leaderboard → per-interval answer */
export function routes(
    profile: Response | (() => Response),
    board: (url: string) => Response,
): Responder {
    return url => {
        if (url.includes('/leaderboard')) return board(url);
        return typeof profile === 'function' ? profile() : profile.clone();
    };
}
