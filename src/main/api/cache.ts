/**
 * In-memory API caches (per session): profiles and stats are stored
 * separately so a period/mode switch costs one request per player.
 * Also de-duplicates concurrent identical requests.
 *   profile: ok 10 min, 404 3 min
 *   stats:   ok 10 min, api_off / never_played / no_data 3 min
 * error / rate_limited / auth results are never cached (callers decide).
 */

import type { PlayerResult } from '../../shared/types';
import type { Outcome } from './outcome';
import type { ProfileShape } from './rankDisplay';

export type ProfileOutcome = Extract<Outcome<ProfileShape>, { kind: 'ok' | 'not_found' }>;

const LONG_TTL_MS = 10 * 60 * 1000;
const SHORT_TTL_MS = 3 * 60 * 1000;

interface Entry<T> {
    data: T;
    expiresAt: number;
}

export class ApiCache {
    private readonly profiles = new Map<string, Entry<ProfileOutcome>>();
    private readonly stats = new Map<string, Entry<PlayerResult>>();
    private readonly inflight = new Map<string, Promise<unknown>>();
    private gen = 0;

    constructor(private readonly now: () => number = Date.now) {}

    /** Bumped by clear(): results that started before a clear must not be stored */
    get generation(): number {
        return this.gen;
    }

    getProfile(username: string): ProfileOutcome | null {
        return this.read(this.profiles, username.toLowerCase());
    }

    setProfile(username: string, data: ProfileOutcome): void {
        const ttl = data.kind === 'ok' ? LONG_TTL_MS : SHORT_TTL_MS;
        this.profiles.set(username.toLowerCase(), { data, expiresAt: this.now() + ttl });
    }

    getStats(key: string): PlayerResult | null {
        return this.read(this.stats, key.toLowerCase());
    }

    /** Stores ok / api_off / never_played / no_data; ignores everything else */
    setStats(key: string, data: PlayerResult): void {
        let ttl: number;
        if (data.status === 'ok') ttl = LONG_TTL_MS;
        else if (data.status === 'api_off' || data.status === 'never_played' || data.status === 'no_data') ttl = SHORT_TTL_MS;
        else return;
        this.stats.set(key.toLowerCase(), { data, expiresAt: this.now() + ttl });
    }

    /** Runs `fn` once per key while a previous run is still pending */
    dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
        const running = this.inflight.get(key) as Promise<T> | undefined;
        if (running) return running;
        const promise = fn().finally(() => {
            if (this.inflight.get(key) === promise) this.inflight.delete(key);
        });
        this.inflight.set(key, promise);
        return promise;
    }

    clear(): void {
        this.profiles.clear();
        this.stats.clear();
        this.inflight.clear();
        this.gen++;
    }

    size(): number {
        return this.stats.size;
    }

    private read<T>(map: Map<string, Entry<T>>, key: string): T | null {
        const entry = map.get(key);
        if (!entry) return null;
        if (this.now() >= entry.expiresAt) {
            map.delete(key);
            return null;
        }
        return entry.data;
    }
}

export const cache = new ApiCache();
