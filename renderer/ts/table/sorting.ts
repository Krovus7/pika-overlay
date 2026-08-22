/**
 * Row sorting — ported from pika-overlay-v3/renderer/overlay.js `comparePlayers`
 * and RANK_PRIORITY. Order: self pinned → party → nicked → loading → error →
 * selected column.
 */

import type { PlayerRow } from './types';

export const RANK_PRIORITY: Record<string, number> = {
    OWNER: 20, ADMIN: 19, MANAGER: 18,
    SR_MOD: 17, MOD: 16, JR_MOD: 15, HELPER: 14,
    YOUTUBER: 13, MEDIA: 12, BUILDER: 11,
    TITAN: 10, LEGEND: 9, LORD: 8, MVP: 7,
    VIP: 6, PRO: 5, ULTRA: 4,
};

export interface SortState {
    col: string;
    dir: number; // -1 = desc, 1 = asc
    pinSelf: boolean;
    myUsername: string;
    myNickName: string;
    isNicked: boolean;
    partyMembers: ReadonlySet<string>;
}

export function comparePlayers(a: PlayerRow, b: PlayerRow, s: SortState): number {
    // Self pinned to the very top (above party, above everything)
    if (s.pinSelf && s.myUsername) {
        const selfKey = s.isNicked && s.myNickName ? s.myNickName : s.myUsername;
        const aSelf = a.username?.toLowerCase() === selfKey;
        const bSelf = b.username?.toLowerCase() === selfKey;
        if (aSelf && !bSelf) return -1;
        if (!aSelf && bSelf) return 1;
    }

    // Party members always on top
    const aParty = s.partyMembers.size > 0 && s.partyMembers.has(a.username?.toLowerCase());
    const bParty = s.partyMembers.size > 0 && s.partyMembers.has(b.username?.toLowerCase());
    if (aParty && !bParty) return -1;
    if (!aParty && bParty) return 1;

    // Nicked players next (below party, above everyone else)
    const aNicked = !!a.nicked;
    const bNicked = !!b.nicked;
    if (aNicked && !bNicked) return -1;
    if (!aNicked && bNicked) return 1;

    if (a.loading && !b.loading) return 1;
    if (!a.loading && b.loading) return -1;
    if (a.error && !b.error)   return 1;
    if (!a.error && b.error)   return -1;

    const aVal = (a as Record<string, unknown>)[s.col] as number ?? -1;
    const bVal = (b as Record<string, unknown>)[s.col] as number ?? -1;
    return s.dir * (bVal - aVal);
}
