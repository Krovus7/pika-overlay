/** Login-age chip logic: how old `lastSeen` is, whether to show it, and its wording. Pure, no DOM. */

export type LoginAgeMode = 'off' | 'lowLevel' | 'all';

export interface LoginAgeSettings {
    loginAge: LoginAgeMode;
    loginAgeMaxLevel: number;
    freshMinutes: number;
}

export interface LoginAgeView {
    text: string;
    fresh: boolean;
    /** Connected for days with no BedWars stats: shown as a bot chip instead of the plain age. */
    bot: boolean;
    title: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A session this long without a single BedWars game is a bot or an AFK account; a real player can play 12h. */
export const BOT_SESSION_MS = 12 * HOUR;

/** "<1m", "7m", "3h", "2d". */
export function formatAge(ms: number): string {
    if (ms < MINUTE) return '<1m';
    if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m`;
    if (ms < DAY) return `${Math.floor(ms / HOUR)}h`;
    return `${Math.floor(ms / DAY)}d`;
}

function plural(n: number, unit: string): string {
    return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

function longAge(ms: number): string {
    if (ms < MINUTE) return 'less than a minute';
    if (ms < HOUR) return plural(Math.floor(ms / MINUTE), 'minute');
    if (ms < DAY) return plural(Math.floor(ms / HOUR), 'hour');
    return plural(Math.floor(ms / DAY), 'day');
}

/** Local HH:MM of an epoch-ms moment. */
function clock(ms: number): string {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Hover wording lives here only. `lastSeen` is the login time while the player is online (verified 2026-11-20). */
function ageTitle(age: number, lastSeen: number, fresh: boolean): string {
    return `Logged in to Pika ${longAge(age)} ago (at ${clock(lastSeen)})${fresh ? ' \u2014 fresh login' : ''}`;
}

function botTitle(age: number): string {
    return `Connected for ${longAge(age)} without logging out and no BedWars stats: likely a bot or AFK account`;
}

export function loginAgeView(
    lastSeen: number | null | undefined,
    level: number | null | undefined,
    now: number,
    settings: LoginAgeSettings,
    status?: string,
): LoginAgeView | null {
    if (settings.loginAge === 'off' || typeof lastSeen !== 'number') return null;
    if (settings.loginAge === 'lowLevel' && (typeof level !== 'number' || level > settings.loginAgeMaxLevel)) return null;
    const age = Math.max(0, now - lastSeen);
    const text = formatAge(age);
    if (status === 'never_played' && age >= BOT_SESSION_MS) {
        return { text: `BOT? ${text}`, fresh: false, bot: true, title: botTitle(age) };
    }
    const fresh = age <= settings.freshMinutes * MINUTE;
    return { text, fresh, bot: false, title: ageTitle(age, lastSeen, fresh) };
}
