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
    title: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

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

/** Hover wording lives here only; what `lastSeen` means on Pika is not verified yet. */
function ageTitle(ms: number): string {
    return `Last seen on Pika ${longAge(ms)} ago (Pika profile)`;
}

export function loginAgeView(
    lastSeen: number | null | undefined,
    level: number | null | undefined,
    now: number,
    settings: LoginAgeSettings,
): LoginAgeView | null {
    if (settings.loginAge === 'off' || typeof lastSeen !== 'number') return null;
    if (settings.loginAge === 'lowLevel' && (typeof level !== 'number' || level > settings.loginAgeMaxLevel)) return null;
    const age = Math.max(0, now - lastSeen);
    const fresh = age <= settings.freshMinutes * MINUTE;
    const text = formatAge(age);
    return { text: fresh ? `FRESH ${text}` : text, fresh, title: ageTitle(age) };
}
