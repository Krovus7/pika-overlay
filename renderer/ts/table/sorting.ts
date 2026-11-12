/**
 * Row ordering: self pinned -> party -> nicked (optional) -> status groups ->
 * selected column. Groups are fixed so a sort direction flip never moves
 * rows without stats above rows with stats.
 */

import type { RowData } from './types';

export const RANK_PRIORITY: Record<string, number> = {
    OWNER: 20, ADMIN: 19, MANAGER: 18,
    SR_MOD: 17, MOD: 16, JR_MOD: 15, HELPER: 14,
    YOUTUBER: 13, MEDIA: 12, BUILDER: 11,
    TITAN: 10, LEGEND: 9, LORD: 8, MVP: 7,
    VIP: 6, PRO: 5, ULTRA: 4,
};

export interface SortState {
    col: string;
    dir: -1 | 1; // -1 = descending
    pinSelf: boolean;
    selfKey: string;
    nickedOnTop: boolean;
    partyMembers: ReadonlySet<string>;
}

function group(d: RowData, nickedOnTop: boolean): number {
    switch (d.status) {
        case 'nicked': return nickedOnTop ? 0 : 2;
        case 'ok': return 1;
        case 'not_found': case 'api_off': case 'never_played': case 'no_data': return 2;
        case 'loading': return 4;
        default: return 3; // error, rate_limited, auth
    }
}

function sortValue(d: RowData, col: string): number {
    if (col === 'rankSortValue') {
        const text = 'rank' in d ? d.rank?.text?.toUpperCase() ?? '' : '';
        return RANK_PRIORITY[text] ?? 0;
    }
    return d.status === 'ok' ? ((d as unknown as Record<string, number>)[col] ?? -1) : -1;
}

export function comparePlayers(a: RowData, b: RowData, s: SortState): number {
    const ka = a.username.toLowerCase();
    const kb = b.username.toLowerCase();

    if (s.pinSelf && s.selfKey) {
        if ((ka === s.selfKey) !== (kb === s.selfKey)) return ka === s.selfKey ? -1 : 1;
    }
    if (s.partyMembers.size > 0) {
        const pa = s.partyMembers.has(ka);
        if (pa !== s.partyMembers.has(kb)) return pa ? -1 : 1;
    }

    const ga = group(a, s.nickedOnTop);
    const gb = group(b, s.nickedOnTop);
    if (ga !== gb) return ga - gb;

    if (ga === 1 || (ga === 2 && s.col === 'rankSortValue')) {
        const diff = sortValue(a, s.col) - sortValue(b, s.col);
        if (diff !== 0) return s.dir * diff;
    }
    return ka < kb ? -1 : ka > kb ? 1 : 0;
}
