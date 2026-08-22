/**
 * Log line patterns — compiled once, shared by the line parser and party parser.
 * Ported 1:1 from pika-overlay-v3/src/logWatcher.js. Do not change semantics
 * without updating the test suite (tests/log-parser.test.ts, sections 1-17).
 */

// ─── Chat wrapper ─────────────────────────────────────────────────────────────
export const RE_CHAT = /\[CHAT\]\s+(.+)$/;

// ─── Game lifecycle ───────────────────────────────────────────────────────────
export const RE_GAME_START_1  = /the game starts in \d+ second/i;
export const RE_GAME_START_2  = /bed ?wars.*starting|game is starting/i;
// Match Recap, scoreboard lines, and ranked kill summaries all signal end-of-game
export const RE_GAME_END_RECAP = /\[Match Recap\]|1st Killer|1st Place|Top Final Kills|(?:1st|2nd|3rd|\d+th)\s+Final\s+Kills/i;
export const RE_GAME_END_ELIM  = /you (?:were|are) (?:eliminated|dead)|game over|team has been eliminated/i;
export const RE_SERVER_CHANGE  = /returning to lobby|sending you to|you left the/i;

// ─── FINAL KILL ───────────────────────────────────────────────────────────────
// Rule: VICTIM is ALWAYS the very first valid MC-name token before the first
// space/verb. Extracted explicitly — not via cleanName — to guarantee no false
// positives.
export const RE_FINAL_KILL_LINE = /^(.+?)\s+FINAL\s+KILL(?:\s+\[x\d+\])?\s*$/i;
export const RE_MC_NAME         = /^[A-Za-z0-9_]{3,16}$/;
export const RE_FIRST_TOKEN     = /^([A-Za-z0-9_]{3,16})\b/;

// ─── Kill feed (non-final kills — detection only, never removal) ──────────────
export const RE_KILL_VICTIM = /^([A-Za-z0-9_]{3,16})\s+(?:was killed|was eliminated|was slain|got filled|was shot|fell off|drowned|was blown|died)\b/i;
export const RE_KILL_KILLER = /^([A-Za-z0-9_]{3,16})\s+killed\s+([A-Za-z0-9_]{3,16})\b/i;

// ─── Bed destruction ──────────────────────────────────────────────────────────
export const RE_BED_BREAK = /\bTeam['']?s?\s+Bed\s+has\s+been\s+destroyed\s+by\s+([A-Za-z0-9_]{3,16})/i;
export const RE_BED_BREAK_MODERN = /BED\s+DESTRUCTION\s*>\s*.+?(?:by|to)\s+([A-Za-z0-9_]{3,16})/i;

// ─── Team tag (bracket format, from scoreboard) ───────────────────────────────
export const RE_TEAM_TAG = /\[(?:RED|BLUE|GREEN|YELLOW|AQUA|WHITE|PINK|GRAY)\]\s+([A-Za-z0-9_]{3,16})/g;

// ─── Pre-game queue ───────────────────────────────────────────────────────────
export const RE_BW_JOIN = /^BedWars\s+\S+\s+(.+?)\s+has joined!\s*\(\d+\/\d+\)/i;
export const RE_BW_QUIT = /^BedWars\s+\S+\s+(.+?)\s+has quit!\s*\(\d+\/\d+\)/i;

// ─── Color codes (§ or U+FFFD from UTF-8 corruption) ──────────────────────────
export const RE_COLOR_CODE = /(?:§|\uFFFD)[0-9a-fk-or]/gi;

// ─── Party tracking ───────────────────────────────────────────────────────────
export const RE_PARTY_PREFIX  = /^Party\b/i;
export const RE_PARTY_JOINED  = /^Party\b.+?([A-Za-z0-9_]{3,16})\s+joined the party/i;
export const RE_PARTY_LEFT    = /^Party\b.+?([A-Za-z0-9_]{3,16})\s+(?:has left|left) the party/i;
export const RE_PARTY_KICKED  = /^Party\b.+?([A-Za-z0-9_]{3,16})\s+(?:has been kicked|was kicked)/i;
export const RE_PARTY_DISBAND = /^Party\b.+?(?:has been disbanded|you (?:have )?left the party|are no longer in a party|not (?:currently )?in a party)/i;
export const RE_PARTY_MEMBERS = /^[^\w]*(?:Party\b.+?)?members?\s*(?:\[[^\]]*\]|\([^)]*\))?\s*:\s*(?:\[[^\]]*\]|\([^)]*\))?\s*(.+)$/i;
export const RE_MEMBER_LIST   = /\bmembers?\s*(?:\[[^\]]*\]|\([^)]*\))?\s*:\s*(?:\[[^\]]*\]|\([^)]*\))?\s*(.+)$/i;
export const RE_PARTY_OWNER   = /^[^\w]*(?:Party\b.+?)?(?:Owner|Leader)\s*:\s*(.+?)\s*$/i;

// "You are not currently in a party" — may arrive WITHOUT a "Party" prefix
export const RE_NOT_IN_PARTY  = /\byou are not (?:currently )?in a party/i;

// ─── Noise skip list (works on color-stripped text) ───────────────────────────
export const RE_SKIP: RegExp[] = [
    /^(?:Guilds?\s|Friends?\s▏|Party\s▏|Party\s>|\[Party\])/i,
    /^(?:\[G\]|\[P\]|\[F\])\s/i,
    /^(?:Friends\s|Guild\s)/i,
    /^(?:\[.*?\] --> \[.*?\])/,
    /joined the lobby/i,
    /^<[A-Za-z+]+>\s+[A-Za-z0-9_]+\s+joined the lobby/i,
    /welcome to pika.?network/i,
    /pika-network\.net/i,
    /store\.pika-network/i,
    /currently playing with/i,
    /^(?:Buy|fBuy|aBuy|aRanks?)\b/i,
    /^(?:and\s+more|buy\s+rank|get\s+rank)/i,
    /^(?:SITE|STORE|VOTE|DISCORD|TIKTOK|YOUTUBE|INSTA|TWITTER)\s*[-–|]/i,
    /welcomes you to pika/i,
    /\bOnline\s+at\s+[A-Z]+\d*-/i,
    /Last seen:/i,
    /^(?:RED|BLUE|GREEN|YELLOW|AQUA|WHITE|PINK|GRAY)\s+[A-Za-z0-9_]{3,16}:/i,
    /team\s+has\s+been\s+eliminated/i,
    /^Team\s+Upgrade\b/i,
    /^\+\s*\d+\s+(?:coins?|iron|gold|diamond|emerald)/i,
    /^\+\d+\s+Experience/i,
    /may only speak English/i,
    /do not have enough materials/i,
];
