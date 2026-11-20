/** Once-per-lobby "watched player entered the table" detection. Pure; the caller owns the delivery. */

import { USER_TYPED_SOURCES } from '../../shared/types';
import type { WatchEntry } from '../../shared/watchlist';

export class WatchAlerts {
    private readonly alerted = new Set<string>();

    constructor(
        private readonly lookup: (name: string) => WatchEntry | undefined,
        /** True for the own name and current party members */
        private readonly isExcluded: (name: string) => boolean = () => false,
    ) {}

    /** The entry to alert about, or undefined when the player came from a typed search, is self or in the party, is not watched, or was already announced in this lobby. */
    check(name: string, source: string): WatchEntry | undefined {
        if (USER_TYPED_SOURCES.includes(source) || source === 'party' || this.isExcluded(name)) return undefined;
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
