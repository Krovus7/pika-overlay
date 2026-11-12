/**
 * BedWars leaderboard extraction — ratios, rounding and zero-division guards
 * ported 1:1 from pika-overlay-v3/src/apiClient.js.
 */

import type { PlayerProfileInfo, PlayerStats } from '../../shared/types';
import { getRankDisplay, type ProfileShape } from './rankDisplay';

export type LeaderboardShape = Record<string, { entries?: Array<{ value: string }> | null }>;

export function profileInfo(profile: ProfileShape): PlayerProfileInfo {
    return {
        rank: getRankDisplay(profile),
        level: profile?.rank?.level ?? null,
        guild: profile?.clan?.name ?? null,
    };
}

/** True when at least one leaderboard key has entries (entries:null = no data) */
export function hasBedwarsData(rawStats: LeaderboardShape): boolean {
    return Object.values(rawStats).some(v => !!v?.entries?.length);
}

/** Builds the full stats result; callers check hasBedwarsData first. */
export function extractStats(username: string, profile: ProfileShape, rawStats: LeaderboardShape): PlayerStats {
    const stat = (key: string): number => {
        const e = rawStats[key];
        if (!e?.entries?.length) return 0;
        return parseInt(e.entries[0]!.value, 10) || 0;
    };

    const finalKills = stat('Final kills');
    const finalDeaths = stat('Final deaths');
    const wins = stat('Wins');
    const losses = stat('Losses');
    const kills = stat('Kills');
    const deaths = stat('Deaths');
    const bedsDestroyed = stat('Beds destroyed');
    const winstreak = stat('Highest winstreak reached');
    const gamesPlayed = stat('Games played');
    const bowKills = stat('Bow kills');     // confirmed key from API
    const meleeKills = stat('Melee kills');
    const voidKills = stat('Void kills');
    const arrowsShot = stat('Arrows shot');
    const arrowsHit = stat('Arrows hit');

    const fkdr = finalDeaths === 0 ? finalKills : finalKills / finalDeaths;
    const wlr = losses === 0 ? wins : wins / losses;
    const kdr = deaths === 0 ? kills : kills / deaths;

    return {
        username,
        status: 'ok',
        ...profileInfo(profile),
        finalKills,
        finalDeaths,
        fkdr: Math.round(fkdr * 100) / 100,
        wins,
        losses,
        wlr: Math.round(wlr * 100) / 100,
        kills,
        deaths,
        kdr: Math.round(kdr * 100) / 100,
        bedsDestroyed,
        winstreak,
        gamesPlayed,
        bowKills,
        meleeKills,
        voidKills,
        arrowsShot,
        arrowsHit,
    };
}
