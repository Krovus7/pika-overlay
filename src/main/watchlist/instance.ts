/** The one WatchlistStore of the app, created at startup in main.ts and read by later code. */

import type { WatchlistStore } from './store';

let current: WatchlistStore | null = null;

export function initWatchlist(store: WatchlistStore): void {
    current = store;
}

/** Throws when called before startup has created the store (a wiring bug, never a runtime state). */
export function getWatchlist(): WatchlistStore {
    if (!current) throw new Error('Watchlist store is not initialised');
    return current;
}
