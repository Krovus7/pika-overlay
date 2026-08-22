/**
 * Fetch with timeout and exponential backoff retry — ported 1:1 from
 * pika-overlay-v3/src/apiClient.js.
 *
 * Retries only on transient errors: 429 (rate limit), 503 (unavailable),
 * AbortError (timeout). Returns the Response on success, or throws after all
 * retries are exhausted.
 */

export interface RetryOptions {
    maxRetries?: number;
    baseDelayMs?: number;
    timeoutMs?: number;
}

export function fetchWithTimeout(url: string, ms = 10_000): Promise<Response> {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(tid));
}

export async function fetchWithRetry(url: string, opts: RetryOptions = {}): Promise<Response> {
    const { maxRetries = 3, baseDelayMs = 600, timeoutMs = 10_000 } = opts;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const res = await fetchWithTimeout(url, timeoutMs);
            // Transient HTTP errors — back off and retry
            if (res.status === 429 || res.status === 503) {
                const retryAfterMs = parseInt(res.headers.get('retry-after') || '0', 10) * 1000;
                const delay = retryAfterMs || baseDelayMs * Math.pow(2, attempt);
                console.warn(`[PikaAPI] HTTP ${res.status} for ${url} — retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
                if (attempt < maxRetries) {
                    await sleep(delay);
                    continue;
                }
                // All retries exhausted — return the last failing Response so callers can inspect
                return res;
            }
            return res; // 200, 404, 500, etc. — return as-is
        } catch (err) {
            lastErr = err;
            const isAbort = (err as Error).name === 'AbortError';
            if (isAbort && attempt < maxRetries) {
                const delay = baseDelayMs * Math.pow(2, attempt);
                console.warn(`[PikaAPI] Timeout for ${url} — retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
                await sleep(delay);
            } else {
                throw err; // non-transient error or out of retries
            }
        }
    }
    throw lastErr;
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
