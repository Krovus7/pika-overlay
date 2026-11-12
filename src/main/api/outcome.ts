/**
 * Classifies one HTTP exchange with the Pika API into an Outcome the pure
 * decision layer can reason about. Never throws.
 */

import { fetchWithRetry, safeJson, type RetryOptions } from './fetch';

export type Outcome<T> =
    | { kind: 'ok'; body: T }
    | { kind: 'private' } // 204: the player keeps stats private
    | { kind: 'auth' }
    | { kind: 'not_found' }
    | { kind: 'rate_limited' }
    | { kind: 'error' };

export async function fetchOutcome<T extends object>(url: string, retry?: RetryOptions): Promise<Outcome<T>> {
    let res: Response;
    try {
        res = await fetchWithRetry(url, retry);
    } catch (err) {
        console.error(`[PikaAPI] Request failed for ${url}:`, (err as Error).message);
        return { kind: 'error' };
    }

    if (res.status === 401) return { kind: 'auth' };
    if (res.status === 404) return { kind: 'not_found' };
    if (res.status === 429 || res.status === 503) return { kind: 'rate_limited' };
    if (res.status === 204) return { kind: 'private' };
    if (!res.ok) {
        console.warn(`[PikaAPI] HTTP ${res.status} for ${url}`);
        return { kind: 'error' };
    }

    try {
        const body = await safeJson(res);
        if (body && typeof body === 'object') return { kind: 'ok', body: body as T };
    } catch (err) {
        console.error(`[PikaAPI] Body read failed for ${url}:`, (err as Error).message);
    }
    return { kind: 'error' };
}
