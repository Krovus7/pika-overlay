/** Sends the current watchlist view to the overlay and the settings window. */

import { IPC_EVENTS } from '../../shared/ipc-contract';
import { broadcast } from '../broadcast';
import type { WatchlistStore } from './store';

export function notifyWatchlist(store: WatchlistStore): void {
    broadcast(IPC_EVENTS.WATCHLIST_UPDATED, store.view());
}
