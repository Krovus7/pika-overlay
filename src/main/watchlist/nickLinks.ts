/** Session-only nick links (never saved): which nick is which teammate. Owned by WatchlistStore. */

import type { NickLink } from '../../shared/watchlist';
import { isValidName } from './validate';

export class NickLinks {
    private links: NickLink[] = [];

    constructor(private readonly now: () => number) {}

    list(): NickLink[] {
        return [...this.links];
    }

    has(name: string): boolean {
        const key = name.toLowerCase();
        return this.links.some(l => l.nick.toLowerCase() === key);
    }

    /**
     * Adds or replaces a link; friend null or '' means "not given".
     * A teammate has one nick: linking F removes F's other links. False when a name is invalid.
     */
    link(nick: string, friend: string | null): boolean {
        if (!isValidName(nick) || (friend && !isValidName(friend))) return false;
        const key = nick.toLowerCase();
        const friendKey = friend?.toLowerCase();
        const next: NickLink = { nick, friend: friend ?? '', addedAt: this.now() };
        const kept = this.links.filter(l => l.nick.toLowerCase() !== key && !(friendKey && l.friend.toLowerCase() === friendKey));
        this.links = [...kept, next];
        return true;
    }

    unlink(nick: string): boolean {
        const key = nick.toLowerCase();
        return this.keep(l => l.nick.toLowerCase() !== key);
    }

    /**
     * Drops links whose friend left the party; "someone else" links go when the party went
     * from non-empty to empty. True when something was removed.
     */
    pruneByParty(partyMembers: readonly string[], wasNonEmpty: boolean): boolean {
        const inParty = new Set(partyMembers.map(m => m.toLowerCase()));
        return this.keep(l => l.friend ? inParty.has(l.friend.toLowerCase()) : !(wasNonEmpty && inParty.size === 0));
    }

    /** "Someone else" links end with the game: the lobby was cleared. True when something was removed. */
    dropFriendless(): boolean {
        return this.keep(l => l.friend !== '');
    }

    private keep(predicate: (link: NickLink) => boolean): boolean {
        const kept = this.links.filter(predicate);
        const changed = kept.length !== this.links.length;
        this.links = kept;
        return changed;
    }
}
