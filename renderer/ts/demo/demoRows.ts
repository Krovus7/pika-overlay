/** Sample rows covering every row state. Used only by the demo/screenshot helpers. */

import type { StatsPayload } from '../../../src/shared/ipc-contract';
import type { PlayerProfileInfo } from '../../../src/shared/types';
import type { RowData } from '../table/types';

type Rank = PlayerProfileInfo['rank'];
const NONE: Rank = { text: '', color: '' };
const rank = (text: string, color: string): Rank => ({ text, color });

interface Nums { fkdr: number; finals: number; kdr: number; wlr: number; wins: number; beds: number; ws: number; kills: number; deaths: number; bow: number }

function ok(username: string, source: string, level: number, r: Rank, guild: string | null, n: Nums): StatsPayload {
    return {
        username, source, status: 'ok', rank: r, level, guild,
        finalKills: n.finals, finalDeaths: Math.round(n.finals / Math.max(n.fkdr, 0.01)), fkdr: n.fkdr,
        wins: n.wins, losses: Math.round(n.wins / Math.max(n.wlr, 0.01)), wlr: n.wlr,
        kills: n.kills, deaths: n.deaths, kdr: n.kdr,
        bedsDestroyed: n.beds, winstreak: n.ws, gamesPlayed: n.wins * 2,
        bowKills: n.bow, meleeKills: 0, voidKills: 0, arrowsShot: 0, arrowsHit: 0,
    };
}

function profile(username: string, source: string, status: 'api_off' | 'never_played' | 'no_data',
    level: number, r: Rank, guild: string | null): StatsPayload {
    return { username, source, status, rank: r, level, guild };
}

function bare(username: string, source: string, status: 'nicked' | 'not_found' | 'error' | 'rate_limited' | 'auth'): StatsPayload {
    return { username, source, status };
}

export const DEMO_SELF = 'DemoSelf';
export const DEMO_PARTY = ['Nova_Kai', 'Mira__'];

export function demoRows(): RowData[] {
    return [
        ok(DEMO_SELF, 'manual', 112, rank('LEGEND', '#ffaa00'), 'Pika', { fkdr: 3.42, finals: 1840, kdr: 1.9, wlr: 2.1, wins: 920, beds: 1120, ws: 4, kills: 5200, deaths: 2730, bow: 310 }),
        ok('Nova_Kai', 'party', 74, rank('MVP', '#55ffff'), 'NightOwls', { fkdr: 1.94, finals: 610, kdr: 1.2, wlr: 1.4, wins: 340, beds: 480, ws: 2, kills: 2100, deaths: 1750, bow: 120 }),
        ok('Mira__', 'party', 41, rank('VIP', '#55ff55'), null, { fkdr: 0.82, finals: 150, kdr: 0.7, wlr: 0.6, wins: 88, beds: 130, ws: 0, kills: 900, deaths: 1290, bow: 40 }),
        ok('SweatLord99', 'join', 540, rank('TITAN', '#ff5555'), 'Apex', { fkdr: 24.3, finals: 21400, kdr: 6.8, wlr: 8.2, wins: 7800, beds: 9100, ws: 31, kills: 40100, deaths: 5900, bow: 2100 }),
        ok('xN1ghtmare', 'tab_list', 288, rank('LORD', '#55ffff'), 'Apex', { fkdr: 12.1, finals: 8800, kdr: 3.4, wlr: 4.6, wins: 3100, beds: 4400, ws: 9, kills: 19500, deaths: 5700, bow: 880 }),
        ok('Tenebris', 'kill_feed', 134, rank('PRO', '#ff5555'), 'Umbra', { fkdr: 4.21, finals: 2300, kdr: 1.8, wlr: 2.2, wins: 1200, beds: 1500, ws: 3, kills: 7400, deaths: 4100, bow: 400 }),
        ok('CasualPlayer', 'join', 58, NONE, null, { fkdr: 1.31, finals: 320, kdr: 0.9, wlr: 1.0, wins: 210, beds: 260, ws: 1, kills: 1500, deaths: 1650, bow: 70 }),
        ok('NewToThis_', 'bed_break', 12, NONE, null, { fkdr: 0.31, finals: 24, kdr: 0.4, wlr: 0.3, wins: 11, beds: 30, ws: 0, kills: 140, deaths: 350, bow: 5 }),
        ok('newbie_0001', 'tab_list', 1, NONE, null, { fkdr: 0, finals: 0, kdr: 0, wlr: 0, wins: 0, beds: 0, ws: 0, kills: 0, deaths: 0, bow: 0 }),
        bare('Xx_Shadow_xX', 'tab_list', 'nicked'),
        bare('SilentFox88', 'join', 'nicked'),
        bare('Jeb_typo', 'manual', 'not_found'),
        profile('PrivateAndy', 'join', 'api_off', 87, rank('VIP', '#55ff55'), 'NightOwls'),
        profile('Ghostwriter', 'kill_feed', 'api_off', 23, NONE, null),
        profile('FreshAlt_77', 'tab_list', 'never_played', 1, NONE, null),
        profile('WeekendWarrior', 'bulk', 'no_data', 64, rank('MVP', '#55ffff'), 'Umbra'),
        bare('LagVictim', 'join', 'error'),
        bare('Overflow42', 'bulk', 'rate_limited'),
        bare('KeyLess', 'manual', 'auth'),
        { username: 'LoadingOne', source: 'join', status: 'loading' },
        { username: 'Pending_User', source: 'tab_list', status: 'loading' },
    ];
}
