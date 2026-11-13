/**
 * API key session — the key in use plus the side effects of changing it.
 */

import { cache } from './cache';
import { health } from './health';
import { rateLimiter } from './rateLimiter';

let apiKey = '';

export function getApiKey(): string {
    return apiKey;
}

/** A different key starts a clean session: health, caches and budget reset. */
export function setApiKey(next: string): void {
    const key = next.trim();
    if (key === apiKey) return;
    apiKey = key;
    health.setKeyStatus(key ? 'ok' : 'key_missing');
    cache.clear();
    rateLimiter.reset();
}

/**
 * The key in use was flagged invalid but just passed a live test (a stray 401,
 * or the key was re-enabled): lookups may resume. Returns true when it re-armed.
 */
export function confirmApiKey(testedKey: string): boolean {
    if (!apiKey || testedKey.trim() !== apiKey || !health.isAuthBlocked()) return false;
    health.setKeyStatus('ok');
    return true;
}
