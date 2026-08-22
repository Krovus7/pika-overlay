/**
 * Line parser — ported 1:1 from pika-overlay-v3/src/logWatcher.js `_parseLine`
 * and `_tryTabList`. The operation ORDER is contractual (HANDOVER v2):
 *
 *   1. RE_CHAT extract msg
 *   2. color-code strip BEFORE trim (BLC owner fix, v2.8.5)
 *   3. party events (before RE_SKIP — always processed)
 *   4. /p info member list (non-"Party" prefix)
 *   5. "not in a party" reset
 *   6. RE_SKIP noise filter
 *   7. game lifecycle — RE_GAME_END_RECAP BEFORE RE_FINAL_KILL_LINE
 *   8. BedWars join/quit
 *   9. FINAL KILL — victim = first token (RE_FIRST_TOKEN, never cleanName)
 *  10. kill feed (detection only)
 *  11. bed break
 *  12. team tags (no early return — may fall through to tab list)
 *  13. tab-list roster (comma-separated, ≥3 names and >60% valid)
 */

import {
    RE_BED_BREAK, RE_BED_BREAK_MODERN, RE_BW_JOIN, RE_BW_QUIT, RE_CHAT,
    RE_COLOR_CODE, RE_FINAL_KILL_LINE, RE_FIRST_TOKEN, RE_GAME_END_ELIM,
    RE_GAME_END_RECAP, RE_GAME_START_1, RE_GAME_START_2, RE_KILL_KILLER,
    RE_KILL_VICTIM, RE_MC_NAME, RE_NOT_IN_PARTY, RE_PARTY_PREFIX,
    RE_SERVER_CHANGE, RE_SKIP, RE_TEAM_TAG,
} from './patterns';
import { cleanName, isCommonWord } from './nameCleaner';
import { PartyParser, type EmitFn } from './partyParser';

export class LineParser {
    private myUsername = '';
    private inPregame = false;
    private readonly partyParser: PartyParser;

    constructor(private readonly emit: EmitFn) {
        this.partyParser = new PartyParser(emit);
    }

    setMyUsername(username: string): void {
        this.myUsername = username.toLowerCase();
    }

    isPregame(): boolean {
        return this.inPregame;
    }

    /** Parse a single (already-trimmed) full log line */
    parseLine(line: string): void {
        const chatM = RE_CHAT.exec(line);
        if (!chatM) return;

        // Strip §/\uFFFD color codes up-front — all downstream regex sees clean
        // text. replace() BEFORE trim() so residual spaces after strip are
        // removed (root-cause fix v2.8.5).
        const msg = chatM[1]!.replace(RE_COLOR_CODE, '').trim();

        // ── Party event tracking (before RE_SKIP — must always be processed) ──
        if (RE_PARTY_PREFIX.test(msg)) {
            if (this.partyParser.tryEvent(msg)) return;
        }

        // ── /p info member list (lines that don't start with "Party") ────────
        if (this.partyParser.tryMemberList(msg)) return;

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
            this.inPregame = false;
            this.emit('game_start');
            return;
        }
        if (RE_GAME_END_RECAP.test(msg)) {
            this.inPregame = false;
            this.emit('game_end');
            this.emit('players_clear');
            return;
        }
        if (RE_GAME_END_ELIM.test(msg)) {
            this.inPregame = false;
            this.emit('game_end');
            return;
        }
        if (RE_SERVER_CHANGE.test(msg)) {
            this.inPregame = false;
            this.emit('game_end');
            this.emit('players_clear');
            return;
        }

        // ── BedWars pre-game queue joins/quits ────────────────────────────────
        const bwJoinM = RE_BW_JOIN.exec(msg);
        if (bwJoinM) {
            const p = cleanName(bwJoinM[1]!);
            if (p && RE_MC_NAME.test(p)) {
                if (p.toLowerCase() === this.myUsername) {
                    this.emit('players_clear');
                    this.inPregame = true;
                    this.emit('pregame_start');
                } else if (!this.inPregame) {
                    this.inPregame = true;
                    this.emit('pregame_start');
                }
                this.emit('player_detected', p, 'join');
            }
            return;
        }

        const bwQuitM = RE_BW_QUIT.exec(msg);
        if (bwQuitM) {
            const p = cleanName(bwQuitM[1]!);
            if (p && RE_MC_NAME.test(p)) this.emit('player_quit', p);
            return;
        }

        // ── Final kill / elimination ──────────────────────────────────────────
        const fkMatch = RE_FINAL_KILL_LINE.exec(msg);
        if (fkMatch) {
            const firstToken = RE_FIRST_TOKEN.exec(fkMatch[1]!.trim());
            if (firstToken && RE_MC_NAME.test(firstToken[1]!)) {
                const victim = firstToken[1]!;
                console.log(`[LogWatcher] FINAL KILL — removing victim: ${victim}`);
                this.emit('player_quit', victim);
            }
            return;
        }

        // ── Kill feed (non-final kills — detection only, no removal) ──────────
        const kvM = RE_KILL_VICTIM.exec(msg);
        if (kvM) {
            this.emit('player_detected', kvM[1]!, 'kill_feed');
        }

        const kkM = RE_KILL_KILLER.exec(msg);
        if (kkM) {
            this.emit('player_detected', kkM[1]!, 'kill_feed');
            this.emit('player_detected', kkM[2]!, 'kill_feed');
        }

        // ── Bed break ─────────────────────────────────────────────────────────
        const bedM = RE_BED_BREAK.exec(msg) || RE_BED_BREAK_MODERN.exec(msg);
        if (bedM) {
            this.emit('player_detected', bedM[1]!, 'bed_break');
            return;
        }

        // ── Team tag (bracket scoreboard format only) ─────────────────────────
        let teamM: RegExpExecArray | null;
        RE_TEAM_TAG.lastIndex = 0;
        while ((teamM = RE_TEAM_TAG.exec(msg)) !== null) {
            this.emit('player_detected', teamM[1]!, 'team_announce');
        }

        // ── Tab-completion roster (comma-separated names) ──────────────────────
        if (msg.includes(',') && !msg.includes(' joined') && !msg.includes(' killed') && !msg.includes(': ')) {
            this.tryTabList(msg);
        }
    }

    private tryTabList(msg: string): void {
        const parts = msg.split(',').map(s => s.trim());
        if (parts.length < 3) return;

        const names: string[] = [];
        for (const part of parts) {
            const n = cleanName(part);
            if (n && RE_MC_NAME.test(n) && !isCommonWord(n)) names.push(n);
        }

        if (names.length >= 3 && names.length > parts.length * 0.6) {
            this.emit('players_sync', names);
            for (const n of names) {
                this.emit('player_detected', n, 'tab_list');
            }
        }
    }
}
