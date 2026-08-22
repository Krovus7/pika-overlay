/**
 * In-memory stats cache (per session), ported 1:1 from
 * pika-overlay-v3/src/cache.js. TTL 10 minutes; cleared on game end.
 */

import type { PlayerStats } from '../../shared/types';

interface CacheEntry {
    data: PlayerStats;
    timestamp: number;
}

const TTL_MS = 10 * 60 * 1000;

export class StatsCache {
    private readonly stats = new Map<string, CacheEntry>();

    getStats(username: string): PlayerStats | null {
        const key = username.toLowerCase();
        const entry = this.stats.get(key);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > TTL_MS) {
            this.stats.delete(key);
            return null;
        }
        return entry.data;
    }

    setStats(username: string, data: PlayerStats): void {
        this.stats.set(username.toLowerCase(), { data, timestamp: Date.now() });
    }

    clear(): void {
        this.stats.clear();
    }

    size(): number {
        return this.stats.size;
    }
}

export const cache = new StatsCache();
