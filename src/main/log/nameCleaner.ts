/**
 * Name cleaning — ported 1:1 from pika-overlay-v3/src/logWatcher.js `_cleanName`
 * and `_isCommonWord`. Returns `null` when no valid MC name can be extracted.
 */

import { RE_COLOR_CODE, RE_MC_NAME } from './patterns';

// ─── Common-word blocklist for tab-list name validation ──────────────────────
// Only pure grammar words. Do NOT add words like "pro", "vip", "red", "solo",
// "quad", "top" — they are valid MC usernames (HANDOVER v2.7 rule).
const COMMON_WORD_BLOCKLIST = new Set([
    'has', 'was', 'the', 'you', 'and', 'are', 'not', 'can', 'all', 'for',
    'did', 'had', 'may', 'use', 'try', 'see', 'say', 'let', 'put', 'set',
]);

/** Returns true if the name is a grammar word, not a player name */
export function isCommonWord(name: string): boolean {
    return COMMON_WORD_BLOCKLIST.has(name.toLowerCase());
}

// Rank/noise words stripped when a raw name contains several words
const PREFIX_NOISE_WORDS = new Set([
    'coal', 'iron', 'gold', 'lapis', 'redstone', 'diamond', 'emerald', 'obsidian', 'bedrock',
    'legend', 'titan', 'champion', 'vip', 'mvp', 'elite', 'pro', 'god', 'ultra', 'hero', 'supreme', 'master', 'overlord', 'donator', 'sponsor',
    'helper', 'mod', 'moderator', 'admin', 'owner', 'developer', 'manager', 'srmod', 'trainee', 'trial',
    'media', 'youtube', 'twitch', 'youtuber', 'famous', 'miniyt', 'player', 'member', 'leader',
    'offline', 'online', 'away', 'afk', 'dnd', 'busy',
]);

/**
 * Clean a raw extracted name.
 * May return `null` — callers must always guard with `RE_MC_NAME.test()`.
 * Not used for FINAL KILL victim extraction (use `RE_FIRST_TOKEN`).
 */
export function cleanName(raw: string | null | undefined): string | null {
    if (!raw) return null;
    let s = raw.replace(RE_COLOR_CODE, '').trim();
    const withoutPrefix = s.replace(/^(?:\[.*?\]|<.*?>|\{.*?\}|\(.*?\)|\|.*?\|)\s*/, '');
    // Safeguard: only strip the rank/bracket prefix if enough alphanumerics remain
    if (withoutPrefix.replace(/[^A-Za-z0-9_]/g, '').length >= 3) {
        s = withoutPrefix;
    }
    s = s.replace(/^[^\w\s]+\s*/, '');

    const words: string[] = [];
    const regex = /\b([A-Za-z0-9_]{3,16})\b/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(s)) !== null) {
        words.push(match[1]!);
    }

    if (words.length === 0) {
        const rough = s.replace(/[^A-Za-z0-9_]/g, '');
        if (rough.length >= 3 && rough.length <= 16) return rough;
        return null;
    }

    if (words.length === 1) return words[0]!;

    for (const w of words) {
        const wl = w.toLowerCase();
        if (!PREFIX_NOISE_WORDS.has(wl) && !COMMON_WORD_BLOCKLIST.has(wl) && !/^\d+$/.test(wl)) {
            return w;
        }
    }

    return words[words.length - 1]!;
}

export { RE_MC_NAME };
