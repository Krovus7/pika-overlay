/**
 * In-memory cache for player stats (per session).
 * Resets when game ends or app restarts.
 */
class Cache {
    constructor() {
        this._stats = new Map(); // username -> { data, timestamp }
        this.TTL_MS = 10 * 60 * 1000; // 10 minutes
    }

    getStats(username) {
        const key = username.toLowerCase();
        const entry = this._stats.get(key);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > this.TTL_MS) {
            this._stats.delete(key);
            return null;
        }
        return entry.data;
    }

    setStats(username, data) {
        this._stats.set(username.toLowerCase(), { data, timestamp: Date.now() });
    }

    clear() {
        this._stats.clear();
    }

    size() {
        return this._stats.size;
    }
}

module.exports = new Cache();
