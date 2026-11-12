/**
 * Fetch with API key, rate gate, timeout and retry.
 *
 * Retries only transient failures: 429/503 (after a global pause) and
 * timeouts. A 401 is never retried and flags the key as invalid (the API
 * documents 401 for every key problem; a 403 is not ours — typically a proxy
 * block — and is treated as an ordinary error).
 * After retries are exhausted a 429/503 Response is returned; timeouts and
 * network errors throw.
 */

import { getApiKey } from './apiSession';
import { health } from './health';
import { rateLimiter, readRateHeaders } from './rateLimiter';

export interface RetryOptions {
    maxRetries?: number;
    baseDelayMs?: number;
    timeoutMs?: number;
}

export function fetchWithTimeout(url: string, ms = 10_000, apiKey = ''): Promise<Response> {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), ms);
    const headers: Record<string, string> = apiKey ? { 'X-Api-Key': apiKey } : {};
    return fetch(url, { signal: ctrl.signal, headers }).finally(() => clearTimeout(tid));
}

/** Pause length after 429/503: retry-after, else x-ratelimit-reset, else backoff */
function pauseDelayMs(res: Response, baseDelayMs: number, attempt: number): number {
    const h = readRateHeaders(res.headers);
    const seconds = h.retryAfterSec || h.resetSec;
    return seconds ? seconds * 1000 : baseDelayMs * Math.pow(2, attempt);
}

async function sendThroughGate(url: string, timeoutMs: number): Promise<Response> {
    const release = await rateLimiter.acquire();
    try {
        return await fetchWithTimeout(url, timeoutMs, getApiKey());
    } finally {
        release();
    }
}

export async function fetchWithRetry(url: string, opts: RetryOptions = {}): Promise<Response> {
    const { maxRetries = 3, baseDelayMs = 600, timeoutMs = 10_000 } = opts;
    for (let attempt = 0; ; attempt++) {
        let res: Response;
        try {
            res = await sendThroughGate(url, timeoutMs);
        } catch (err) {
            const isAbort = (err as Error).name === 'AbortError';
            if (isAbort && attempt < maxRetries) {
                const delay = baseDelayMs * Math.pow(2, attempt);
                console.warn(`[PikaAPI] Timeout for ${url} — retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
                await sleep(delay);
                continue;
            }
            health.setUnreachable(true);
            throw err;
        }

        health.setUnreachable(false);
        rateLimiter.observe(readRateHeaders(res.headers));

        if (res.status === 401) {
            health.setKeyStatus('key_invalid');
            return res;
        }
        if (res.status === 429 || res.status === 503) {
            const delay = pauseDelayMs(res, baseDelayMs, attempt);
            rateLimiter.pauseFor(delay);
            console.warn(`[PikaAPI] HTTP ${res.status} for ${url} — attempt ${attempt + 1}/${maxRetries + 1}, paused ${delay}ms`);
            if (attempt < maxRetries) continue;
        }
        return res;
    }
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** Safe JSON parser — null on non-ok responses, empty bodies or parse errors */
export async function safeJson(res: Response): Promise<unknown> {
    if (!res.ok) return null;
    const text = await res.text();
    if (!text?.trim()) return null;
    try { return JSON.parse(text); } catch { return null; }
}
