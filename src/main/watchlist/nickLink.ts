/** Linking a nick to a teammate: saved in the store, then the nick leaves the table for good. */

import type { PlayerRegistry } from '../state';
import type { WatchlistStore } from './store';

/** True when the link was saved. `hide` tells the renderer to drop the row (lowercase key). */
export function linkNickAndHide(
    store: WatchlistStore,
    registry: PlayerRegistry,
    hide: (key: string) => void,
    nick: string,
    friend: string | null,
): boolean {
    if (!store.linkNick(nick, friend)) return false;
    if (registry.delete(nick)) hide(nick.toLowerCase());
    return true;
}
