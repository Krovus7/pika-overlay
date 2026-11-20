/** Once-per-lobby "watched player entered the table" detection. Pure; the caller owns the delivery. */

import type { WatchEntry } from '../../shared/watchlist';

export class WatchAlerts {
    private readonly alerted = new Set<string>();

    constructor(private readonly lookup: (name: string) => WatchEntry | undefined) {}

    /** The entry to alert about, or undefined when the player is not watched or was already announced in this lobby. */
    check(name: string): WatchEntry | undefined {
        const key = name.toLowerCase();
        if (this.alerted.has(key)) return undefined;
        const entry = this.lookup(name);
        if (entry) this.alerted.add(key);
        return entry;
    }

    /** The lobby changed (players_clear). */
    reset(): void {
        this.alerted.clear();
    }
}
