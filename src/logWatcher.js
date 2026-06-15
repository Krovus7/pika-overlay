const fs = require('fs');
const { EventEmitter } = require('events');

/**
 * Watches a Minecraft log file in real-time and emits events
 * for relevant Pika-Network BedWars messages.
 *
 * Events:
 *   'player_detected'  (username: string, source: string)  – player found in game
 *   'player_quit'      (username: string)                  – player left/eliminated
 *   'players_sync'     (names: string[])                   – full roster sync (tab list)
 *   'players_clear'    ()                                  – clear all players
 *   'pregame_start'    ()                                  – pre-game queue detected
 *   'game_start'       ()                                  – BedWars match started
 *   'game_end'         ()                                  – BedWars match ended/left
 *   'log_line'         (line: string)                      – raw line (for debug panel)
 */

// ─── Regex constants (compiled once) ────────────────────────────────────────
const RE_CHAT          = /\[CHAT\]\s+(.+)$/;
const RE_GAME_START_1  = /the game starts in \d+ second/i;
const RE_GAME_START_2  = /bed ?wars.*starting|game is starting/i;
// Match Recap, scoreboard lines, and ranked kill summaries all signal end-of-game
const RE_GAME_END_RECAP = /\[Match Recap\]|1st Killer|1st Place|Top Final Kills|(?:1st|2nd|3rd|\d+th)\s+Final\s+Kills/i;
const RE_GAME_END_ELIM  = /you (?:were|are) (?:eliminated|dead)|game over|team has been eliminated/i;
const RE_SERVER_CHANGE  = /returning to lobby|sending you to|you left the/i;

// ─── FINAL KILL ──────────────────────────────────────────────────────────────
// Rule: VICTIM is ALWAYS the very first valid MC-name token before the first space/verb.
// Extracted explicitly — not via _cleanName — to guarantee no false positives.
const RE_FINAL_KILL_LINE = /^(.+?)\s+FINAL\s+KILL(?:\s+\[x\d+\])?\s*$/i;
const RE_MC_NAME         = /^[A-Za-z0-9_]{3,16}$/;
const RE_FIRST_TOKEN     = /^([A-Za-z0-9_]{3,16})\b/;

// ─── Kill feed ───────────────────────────────────────────────────────────────
// Non-final kills — used only for player DETECTION (not removal)
const RE_KILL_VICTIM = /^([A-Za-z0-9_]{3,16})\s+(?:was killed|was eliminated|was slain|got filled|was shot|fell off|drowned|was blown|died)\b/i;
const RE_KILL_KILLER = /^([A-Za-z0-9_]{3,16})\s+killed\s+([A-Za-z0-9_]{3,16})\b/i;

// ─── Bed destruction ─────────────────────────────────────────────────────────
const RE_BED_BREAK = /\bTeam['']?s?\s+Bed\s+has\s+been\s+destroyed\s+by\s+([A-Za-z0-9_]{3,16})/i;
const RE_BED_BREAK_MODERN = /BED\s+DESTRUCTION\s*>\s*.+?(?:by|to)\s+([A-Za-z0-9_]{3,16})/i;

// ─── Team tag (bracket format, from scoreboard) ──────────────────────────────
const RE_TEAM_TAG = /\[(?:RED|BLUE|GREEN|YELLOW|AQUA|WHITE|PINK|GRAY)\]\s+([A-Za-z0-9_]{3,16})/g;

// ─── Pre-game queue ──────────────────────────────────────────────────────────
const RE_BW_JOIN = /^BedWars\s+\S+\s+(.+?)\s+has joined!\s*\(\d+\/\d+\)/i;
const RE_BW_QUIT = /^BedWars\s+\S+\s+(.+?)\s+has quit!\s*\(\d+\/\d+\)/i;

// ─── Color codes ─────────────────────────────────────────────────────────────
const RE_COLOR_CODE = /(?:§|\uFFFD)[0-9a-fk-or]/gi;

// ─── Common-word blocklist for tab-list name validation ──────────────────────
const COMMON_WORD_BLOCKLIST = new Set([
    'has','was','the','you','and','are','not','can','all','for',
    'did','had','may','use','try','see','say','let','put','set',
]);

/** Returns true if the name is a grammar word, not a player name */
function _isCommonWord(name) {
    return COMMON_WORD_BLOCKLIST.has(name.toLowerCase());
}

// ─── Party tracking ─────────────────────────────────────────────────────────
const RE_PARTY_PREFIX  = /^Party\b/i;
const RE_PARTY_JOINED  = /^Party\b.+?([A-Za-z0-9_]{3,16})\s+joined the party/i;
const RE_PARTY_LEFT    = /^Party\b.+?([A-Za-z0-9_]{3,16})\s+(?:has left|left) the party/i;
const RE_PARTY_KICKED  = /^Party\b.+?([A-Za-z0-9_]{3,16})\s+(?:has been kicked|was kicked)/i;
const RE_PARTY_DISBAND = /^Party\b.+?(?:has been disbanded|you (?:have )?left the party|are no longer in a party|not (?:currently )?in a party)/i;
const RE_PARTY_MEMBERS = /^[^\w]*(?:Party\b.+?)?members?\s*(?:\[[^\]]*\]|\([^)]*\))?\s*:\s*(?:\[[^\]]*\]|\([^)]*\))?\s*(.+)$/i;
const RE_MEMBER_LIST   = /\bmembers?\s*(?:\[[^\]]*\]|\([^)]*\))?\s*:\s*(?:\[[^\]]*\]|\([^)]*\))?\s*(.+)$/i;
const RE_PARTY_OWNER   = /^[^\w]*(?:Party\b.+?)?(?:Owner|Leader)\s*:\s*(.+?)\s*$/i;

// "You are not currently in a party" — may arrive WITHOUT a "Party" prefix
const RE_NOT_IN_PARTY  = /\byou are not (?:currently )?in a party/i;

// ─── Noise skip list ─────────────────────────────────────────────────────────
const RE_SKIP = [
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

class LogWatcher extends EventEmitter {
    constructor() {
        super();
        this._logPath    = null;
        this._myUsername = '';
        this._pos        = 0;
        this._timer      = null;
        this._pollMs     = 500;
        this._inPregame  = false;
        this._pendingPartyOwner = null;
    }

    start(logPath, myUsername = '') {
        if (this._timer) this.stop();
        this._logPath    = logPath;
        this._myUsername = myUsername.toLowerCase();

        if (!fs.existsSync(logPath)) {
            console.warn(`[LogWatcher] Log not found: ${logPath}`);
            return false;
        }

        try {
            this._pos = fs.statSync(logPath).size;
        } catch {
            this._pos = 0;
        }

        this._timer = setInterval(() => this._poll(), this._pollMs);
        console.log(`[LogWatcher] Watching: ${logPath}`);
        return true;
    }

    stop() {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
    }

    // ─── Polling ──────────────────────────────────────────────────────────────
    _poll() {
        if (!this._logPath) return;
        let stat;
        try { stat = fs.statSync(this._logPath); } catch { return; }

        if (stat.size < this._pos) this._pos = 0;    // file rotated
        if (stat.size === this._pos) return;           // nothing new

        let buf;
        const len = stat.size - this._pos;
        try {
            const fd = fs.openSync(this._logPath, 'r');
            buf = Buffer.allocUnsafe(len);
            fs.readSync(fd, buf, 0, len, this._pos);
            fs.closeSync(fd);
            this._pos = stat.size;
        } catch {
            return; // file locked, retry next tick
        }

        const lines = buf.toString('utf8').split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            this.emit('log_line', trimmed);
            this._parseLine(trimmed);
        }
    }

    // ─── Parse a single (already-trimmed) log line ────────────────────────────
    _parseLine(line) {
        const chatM = RE_CHAT.exec(line);
        if (!chatM) return;

        // Strip §/\uFFFD color codes up-front — all downstream regex sees clean text.
        const msg = chatM[1].replace(RE_COLOR_CODE, '').trim();

        // ── Party event tracking (before RE_SKIP — must always be processed) ────
        if (RE_PARTY_PREFIX.test(msg)) {
            if (this._tryPartyEvent(msg)) return;
        }

        // ── /p info member list (lines that don't start with "Party") ────────
        if (this._tryPartyMemberList(msg)) return;

        // ── "You are not in a party" without Party prefix ─────────────────────
        if (RE_NOT_IN_PARTY.test(msg)) {
            this.emit('party_clear');
            return;
        }

        // ── Skip noise ────────────────────────────────────────────────────────
        for (const re of RE_SKIP) {
            if (re.test(msg)) return;
        }

        // ── Game lifecycle ────────────────────────────────────────────────────
        if (RE_GAME_START_1.test(msg) || RE_GAME_START_2.test(msg)) {
            this._inPregame = false;
            this.emit('game_start');
            return;
        }
        if (RE_GAME_END_RECAP.test(msg)) {
            this._inPregame = false;
            this.emit('game_end');
            this.emit('players_clear');
            return;
        }
        if (RE_GAME_END_ELIM.test(msg)) {
            this._inPregame = false;
            this.emit('game_end');
            return;
        }
        if (RE_SERVER_CHANGE.test(msg)) {
            this._inPregame = false;
            this.emit('game_end');
            this.emit('players_clear');
            return;
        }

        // ── BedWars pre-game queue joins/quits ────────────────────────────────
        const bwJoinM = RE_BW_JOIN.exec(msg);
        if (bwJoinM) {
            const p = this._cleanName(bwJoinM[1]);
            if (p && RE_MC_NAME.test(p)) {
                if (p.toLowerCase() === this._myUsername) {
                    this.emit('players_clear');
                    this._inPregame = true;
                    this.emit('pregame_start');
                } else if (!this._inPregame) {
                    this._inPregame = true;
                    this.emit('pregame_start');
                }
                this.emit('player_detected', p, 'join');
            }
            return;
        }

        const bwQuitM = RE_BW_QUIT.exec(msg);
        if (bwQuitM) {
            const p = this._cleanName(bwQuitM[1]);
            if (p && RE_MC_NAME.test(p)) this.emit('player_quit', p);
            return;
        }

        // ── Final kill / elimination ──────────────────────────────────────────
        const fkMatch = RE_FINAL_KILL_LINE.exec(msg);
        if (fkMatch) {
            const firstToken = RE_FIRST_TOKEN.exec(fkMatch[1].trim());
            if (firstToken && RE_MC_NAME.test(firstToken[1])) {
                const victim = firstToken[1];
                console.log(`[LogWatcher] FINAL KILL — removing victim: ${victim}`);
                this.emit('player_quit', victim);
            }
            return;
        }

        // ── Kill feed (non-final kills — detection only, no removal) ──────────
        const kvM = RE_KILL_VICTIM.exec(msg);
        if (kvM) {
            this.emit('player_detected', kvM[1], 'kill_feed');
        }

        const kkM = RE_KILL_KILLER.exec(msg);
        if (kkM) {
            this.emit('player_detected', kkM[1], 'kill_feed');
            this.emit('player_detected', kkM[2], 'kill_feed');
        }

        // ── Bed break ─────────────────────────────────────────────────────────
        const bedM = RE_BED_BREAK.exec(msg) || RE_BED_BREAK_MODERN.exec(msg);
        if (bedM) {
            this.emit('player_detected', bedM[1], 'bed_break');
            return;
        }

        // ── Team tag (bracket scoreboard format only) ──────────────────────────
        let teamM;
        RE_TEAM_TAG.lastIndex = 0;
        while ((teamM = RE_TEAM_TAG.exec(msg)) !== null) {
            this.emit('player_detected', teamM[1], 'team_announce');
        }

        // ── Tab-completion roster (comma-separated names) ──────────────────────
        if (msg.includes(',') && !msg.includes(' joined') && !msg.includes(' killed') && !msg.includes(': ')) {
            this._tryTabList(msg);
        }
    }

    // ─── Party event detection ──────────────────────────────────────────────
    _tryPartyEvent(msg) {
        const ownerM = RE_PARTY_OWNER.exec(msg);
        if (ownerM) {
            const name = this._cleanName(ownerM[1].trim());
            if (name && RE_MC_NAME.test(name) && !_isCommonWord(name)) {
                this._pendingPartyOwner = name;
                console.log(`[LogWatcher] party owner buffered (in party event): ${name}`);
                this.emit('party_joined', name);
            }
            return true;
        }

        const membersM = RE_PARTY_MEMBERS.exec(msg) || RE_MEMBER_LIST.exec(msg);
        if (membersM) {
            const names = membersM[1]
                .split(',')
                .map(s => this._cleanName(s.trim()))
                .filter(n => n && RE_MC_NAME.test(n) && !_isCommonWord(n));

            if (names.length === 0) {
                console.log('[LogWatcher] member line matched but no valid names — preserving pending owner:', this._pendingPartyOwner);
                return true;
            }

            const owner = this._pendingPartyOwner || null;
            this._pendingPartyOwner = null;

            const allMembers = owner
                ? [owner, ...names.filter(n => n.toLowerCase() !== owner.toLowerCase())]
                : names;

            if (allMembers.length >= 2 || (owner && names.length >= 1)) {
                this.emit('party_members', allMembers);
            } else if (names.length > 0) {
                this.emit('party_members', names);
            }
            return true;
        }

        const joinM = RE_PARTY_JOINED.exec(msg);
        if (joinM) {
            this.emit('party_joined', joinM[1]);
            return true;
        }

        if (RE_PARTY_DISBAND.test(msg)) {
            this.emit('party_clear');
            return true;
        }

        const leftM = RE_PARTY_LEFT.exec(msg);
        if (leftM) {
            this.emit('party_left', leftM[1]);
            return true;
        }

        const kickM = RE_PARTY_KICKED.exec(msg);
        if (kickM) {
            this.emit('party_left', kickM[1]);
            return true;
        }

        return true;
    }

    // ─── /p info member list (non-"Party" prefix) ─────────────────────────────
    _tryPartyMemberList(msg) {
        const ownerM = RE_PARTY_OWNER.exec(msg);
        if (ownerM) {
            const name = this._cleanName(ownerM[1].trim());
            if (name && RE_MC_NAME.test(name) && !_isCommonWord(name)) {
                this._pendingPartyOwner = name;
                console.log(`[LogWatcher] party owner buffered (non-party line): ${name}`);
                this.emit('party_joined', name);
                return true;
            }
            return true;
        }

        const m = RE_MEMBER_LIST.exec(msg);
        if (!m) return false;

        const names = m[1]
            .split(',')
            .map(s => this._cleanName(s.trim()))
            .filter(n => n && RE_MC_NAME.test(n) && !_isCommonWord(n));

        if (names.length === 0) {
            console.log('[LogWatcher] member line (non-party) matched but no valid names — preserving pending owner:', this._pendingPartyOwner);
            return true;
        }

        const owner = this._pendingPartyOwner || null;
        this._pendingPartyOwner = null;

        const allMembers = owner
            ? [owner, ...names.filter(n => n.toLowerCase() !== owner.toLowerCase())]
            : names;

        if (allMembers.length >= 2 || (owner && names.length >= 1)) {
            this.emit('party_members', allMembers);
            return true;
        }
        return false;
    }

    // ─── Tab-list detection ───────────────────────────────────────────────────
    _tryTabList(msg) {
        const parts = msg.split(',').map(s => s.trim());
        if (parts.length < 3) return;

        const names = [];
        for (const part of parts) {
            const n = this._cleanName(part);
            if (n && RE_MC_NAME.test(n) && !_isCommonWord(n)) names.push(n);
        }

        if (names.length >= 3 && names.length > parts.length * 0.6) {
            this.emit('players_sync', names);
            for (const n of names) {
                this.emit('player_detected', n, 'tab_list');
            }
        }
    }

    // ─── Clean a raw extracted name ───────────────────────────────────────────
    _cleanName(raw) {
        if (!raw) return null;
        let s = raw.replace(RE_COLOR_CODE, '').trim();
        const withoutPrefix = s.replace(/^(?:\[.*?\]|<.*?>|\{.*?\}|\(.*?\)|\|.*?\|)\s*/, '');
        if (withoutPrefix.replace(/[^A-Za-z0-9_]/g, '').length >= 3) {
            s = withoutPrefix;
        }
        s = s.replace(/^[^\w\s]+\s*/, '');

        const words = [];
        const regex = /\b([A-Za-z0-9_]{3,16})\b/g;
        let match;
        while ((match = regex.exec(s)) !== null) {
            words.push(match[1]);
        }

        if (words.length === 0) {
            const rough = s.replace(/[^A-Za-z0-9_]/g, '');
            if (rough.length >= 3 && rough.length <= 16) return rough;
            return null;
        }

        if (words.length === 1) return words[0];

        const PREFIX_NOISE_WORDS = new Set([
            'coal', 'iron', 'gold', 'lapis', 'redstone', 'diamond', 'emerald', 'obsidian', 'bedrock',
            'legend', 'titan', 'champion', 'vip', 'mvp', 'elite', 'pro', 'god', 'ultra', 'hero', 'supreme', 'master', 'overlord', 'donator', 'sponsor',
            'helper', 'mod', 'moderator', 'admin', 'owner', 'developer', 'manager', 'srmod', 'trainee', 'trial',
            'media', 'youtube', 'twitch', 'youtuber', 'famous', 'miniyt', 'player', 'member', 'leader',
            'offline', 'online', 'away', 'afk', 'dnd', 'busy'
        ]);

        for (const w of words) {
            const wl = w.toLowerCase();
            if (!PREFIX_NOISE_WORDS.has(wl) && !COMMON_WORD_BLOCKLIST.has(wl) && !/^\d+$/.test(wl)) {
                return w;
            }
        }

        return words[words.length - 1];
    }
}

module.exports = new LogWatcher();
