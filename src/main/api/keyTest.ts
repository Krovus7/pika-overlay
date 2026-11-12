/**
 * Validates an API key against the live API without touching the saved key,
 * the caches, the rate budget or the global health.
 */

import type { ApiKeyTestResult } from '../../shared/types';
import { fetchWithTimeout } from './fetch';

const PROBE_URL = 'https://stats.pika-network.net/api/profile/Notch';
const TEST_TIMEOUT_MS = 8_000;

export async function testApiKey(key: string): Promise<ApiKeyTestResult> {
    const trimmed = key.trim();
    if (!trimmed) return { ok: false, reason: 'missing' };

    let res: Response;
    try {
        res = await fetchWithTimeout(PROBE_URL, TEST_TIMEOUT_MS, trimmed);
    } catch (err) {
        console.warn('[PikaAPI] Key test failed:', (err as Error).message);
        return { ok: false, reason: 'unreachable' };
    }

    if (res.status === 401) return { ok: false, reason: 'invalid' };
    if (res.status === 429) return { ok: false, reason: 'rate_limited' };
    if (res.status === 403 || res.status >= 500) return { ok: false, reason: 'unreachable' };
    return { ok: true, reason: 'ok' };
}
