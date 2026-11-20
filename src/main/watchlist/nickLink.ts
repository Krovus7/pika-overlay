/** Linking a nick to a teammate: kept in the store for this session, then the nick leaves the table. */

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

/** A link to a friend needs that friend in the party right now; "someone else" (null or '') always may. */
export function mayLink(friend: string | null, party: { has(name: string): boolean }): boolean {
    return !friend || party.has(friend.toLowerCase());
}
