/**
 * Rank display mapping — ported 1:1 from pika-overlay-v3/src/apiClient.js
 * `getRankDisplay` and its rank tables.
 */

export interface RankDisplay {
    text: string;
    color: string;
}

interface RankTag {
    text: string;
    color: string;
}

const DONOR_RANKS: Array<[string, string | RankTag]> = [
    ['TITAN', '#ff5555'],
    ['LEGEND', '#ffaa00'],
    ['LORD', '#55ffff'],
    ['MVP', '#55ffff'],
    ['VIP', '#55ff55'],
    ['PRO', '#ff5555'],
    ['ULTRA', '#ffff55'],
];

const STAFF_RANKS: Array<[string, string | RankTag]> = [
    ['OWNER', '#ff5555'],
    ['ADMIN', '#ff5555'],
    ['MANAGER', '#ff5555'],
    ['SR_MOD', { text: 'Sr.Mod', color: '#00aa00' }],
    ['MOD', '#00aa00'],
    ['JR_MOD', { text: 'Jr.Mod', color: '#00aa00' }],
    ['HELPER', '#5555ff'],
    ['BUILDER', '#ffaa00'],
    ['YOUTUBER', { text: 'YT', color: '#ff5555' }],
    ['MEDIA', '#ff5555'],
];

export interface ApiRank {
    name?: string;
    displayName?: string;
}

export interface ProfileShape {
    rank?: { rankDisplay?: string; level?: number | null };
    ranks?: Array<string | ApiRank>;
    username?: string;
    clan?: { name?: string } | null;
}

export function getRankDisplay(profile: ProfileShape | null | undefined): RankDisplay {
    if (!profile) return { text: '', color: '#aaaaaa' };

    const rawDisplay = profile.rank?.rankDisplay || '';
    for (const [tag, val] of DONOR_RANKS) {
        if (rawDisplay.includes(tag)) {
            return typeof val === 'string' ? { text: tag, color: val } : val;
        }
    }

    // API returns ranks as [{name, displayName}] objects OR plain strings — handle both
    const rawRanks = profile.ranks || [];
    const rankNames = rawRanks.map(r => (typeof r === 'object' ? r.name : r)).filter(Boolean);
    for (const [id, val] of STAFF_RANKS) {
        if (rankNames.includes(id)) {
            return typeof val === 'string' ? { text: id, color: val } : val;
        }
    }

    return { text: '', color: '#aaaaaa' };
}
