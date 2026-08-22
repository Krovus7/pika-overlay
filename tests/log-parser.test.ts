/**
 * Log parser test suite — ported from pika-overlay-v3/test_logwatcher.js
 * (sections 1-17). Green = non-regression contract for the line parser.
 *
 * Run: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LineParser } from '../src/main/log/lineParser';
import { cleanName } from '../src/main/log/nameCleaner';
import { getRankDisplay } from '../src/main/api/rankDisplay';

interface EmittedEvent {
    event: string;
    args: unknown[];
}

/** Parse a single chat line wrapped like a real log line, capturing events */
function parseLineEvents(line: string, username = ''): EmittedEvent[] {
    const events: EmittedEvent[] = [];
    const parser = new LineParser((event, ...args) => events.push({ event, args }));
    parser.setMyUsername(username);
    parser.parseLine(`[12:34:56] [Client thread/INFO]: [CHAT] ${line}`);
    return events;
}

/** Parse several lines sequentially through one parser (party owner buffering) */
function parseSequenceEvents(lines: string[]): EmittedEvent[] {
    const events: EmittedEvent[] = [];
    const parser = new LineParser((event, ...args) => events.push({ event, args }));
    for (const line of lines) {
        parser.parseLine(`[12:34:56] [Client thread/INFO]: [CHAT] ${line}`);
    }
    return events;
}

function detectedNames(events: EmittedEvent[]): string[] {
    return events.filter(e => e.event === 'player_detected').map(e => e.args[0] as string);
}

// ─── Section 1: Server-join / Lobby noise ─────────────────────────────────────
describe('1. Server-join / Lobby noise', () => {
    it('Guild chat line is ignored', () => {
        assert.equal(parseLineEvents('[G] SomePlayer: hello world').length, 0);
    });

    it('Party chat line is ignored', () => {
        assert.equal(parseLineEvents('[P] SomePlayer: ready?').length, 0);
    });

    it('Friends chat prefix is ignored', () => {
        assert.equal(parseLineEvents('Friends ▏ SomePlayer: gg').length, 0);
    });

    it('Party join system message emits party_joined (v2.7 tracking)', () => {
        const evts = parseLineEvents('Party ▏ SomePlayer has joined the party.');
        assert.ok(evts.some(e => e.event === 'party_joined'),
            'v2.7: party join should emit party_joined, not be silently ignored');
    });

    it('Rank-join lobby announcement is ignored', () => {
        assert.equal(parseLineEvents('<VIP> SomePlayer joined the lobby!').length, 0);
    });

    it('<Titan> rank join is ignored', () => {
        assert.equal(parseLineEvents('<Titan> BestPlayer123 joined the lobby!').length, 0);
    });

    it('"joined the lobby" generic is ignored', () => {
        assert.equal(parseLineEvents('PlayerXYZ joined the lobby!').length, 0);
    });

    it('MOTD / welcome message does NOT detect fake player', () => {
        const motd = [
            'Welcome to Pika-Network! Use /discord to chat with the team.',
            'PvP has been disabled for 5 seconds.',
            'Remember to vote at vote.pika-network.net for rewards!',
            '→ TIP: Type /bwshop to access the BedWars shop.',
        ];
        for (const line of motd) {
            assert.equal(detectedNames(parseLineEvents(line)).length, 0,
                `MOTD line falsely detected player in: "${line}"`);
        }
    });
});

// ─── Section 2: BedWars pre-game join/quit ────────────────────────────────────
describe('2. Pre-game join / quit', () => {
    it('BedWars join detected correctly', () => {
        const det = parseLineEvents('BedWars ✙ PlayerName has joined! (5/8)')
            .find(e => e.event === 'player_detected' && e.args[0] === 'PlayerName');
        assert.ok(det, 'Should detect PlayerName from BedWars join');
        assert.equal(det.args[1], 'join', 'Source should be "join"');
    });

    it('BedWars join — self triggers pregame_start + players_clear', () => {
        const evts = parseLineEvents('BedWars ✙ MyPlayer has joined! (1/8)', 'MyPlayer');
        assert.ok(evts.some(e => e.event === 'pregame_start'), 'Should emit pregame_start');
        assert.ok(evts.some(e => e.event === 'players_clear'), 'Should emit players_clear on self-join');
    });

    it('BedWars quit detected correctly', () => {
        const quit = parseLineEvents('BedWars ✙ QuitterName has quit! (4/8)')
            .find(e => e.event === 'player_quit' && e.args[0] === 'QuitterName');
        assert.ok(quit, 'Should emit player_quit for BedWars quit');
    });

    it('BedWars join with "?" symbol still works', () => {
        const det = parseLineEvents('BedWars ? CoolDude99 has joined! (3/8)')
            .find(e => e.event === 'player_detected' && e.args[0] === 'CoolDude99');
        assert.ok(det, 'Should detect CoolDude99 with ? join symbol');
    });

    it('BedWars join with color-coded rank does NOT produce empty/wrong name', () => {
        const det = parseLineEvents('BedWars ✙ §6[MVP]§r SomePlayer has joined! (2/8)')
            .find(e => e.event === 'player_detected');
        if (det) {
            assert.match(det.args[0] as string, /^[A-Za-z0-9_]{3,16}$/,
                `Detected name "${det.args[0]}" is not a valid MC name`);
        }
    });
});

// ─── Section 3: Final kill / elimination ──────────────────────────────────────
describe('3. Final Kill detection', () => {
    it('Classic final kill removes victim', () => {
        const quit = parseLineEvents('sav1yaoff has been killed by ancientfreedom12 FINAL KILL')
            .find(e => e.event === 'player_quit');
        assert.ok(quit, 'Should emit player_quit');
        assert.equal(quit.args[0], 'sav1yaoff', 'Victim should be sav1yaoff');
    });

    it('Final kill with [x2] suffix still removes victim', () => {
        const quit = parseLineEvents('somikasomi2 got attacked by a carrot from Gerberas FINAL KILL [x2]')
            .find(e => e.event === 'player_quit');
        assert.ok(quit, 'Should emit player_quit for [x2] final kill');
        assert.equal(quit.args[0], 'somikasomi2', 'Victim should be somikasomi2');
    });

    it('Final kill "got killaurad by" variant', () => {
        const quit = parseLineEvents("legend_295 got killaura'd by kick1026B FINAL KILL")
            .find(e => e.event === 'player_quit');
        assert.ok(quit, 'Should emit player_quit');
        assert.equal(quit.args[0], 'legend_295');
    });

    it('Final kill "met the hacker" variant', () => {
        const quit = parseLineEvents('Faizan_7 met the hacker called kick1026B FINAL KILL')
            .find(e => e.event === 'player_quit');
        assert.ok(quit, 'Should emit player_quit');
        assert.equal(quit.args[0], 'Faizan_7');
    });

    it('"[Match Recap] 1st Final Kills" recap line triggers game_end, NOT player_quit', () => {
        const evts = parseLineEvents('[Match Recap] 1st Final Kills: ProPlayer99');
        assert.ok(evts.some(e => e.event === 'game_end'), 'Match Recap should emit game_end');
        assert.ok(!evts.some(e => e.event === 'player_quit'), 'Match Recap should NOT emit player_quit');
    });
});

// ─── Section 4: Bed destruction ───────────────────────────────────────────────
describe('4. Bed destruction', () => {
    it('Classic bed break: "Team\'s Bed has been destroyed by PlayerA"', () => {
        const det = parseLineEvents("RED Team's Bed has been destroyed by PlayerA")
            .find(e => e.event === 'player_detected' && e.args[0] === 'PlayerA');
        assert.ok(det, 'Should detect PlayerA from bed break');
        assert.equal(det.args[1], 'bed_break');
    });

    it('Modern bed break: "BED DESTRUCTION > RED by PlayerB"', () => {
        const det = parseLineEvents('BED DESTRUCTION > RED by PlayerB')
            .find(e => e.event === 'player_detected' && e.args[0] === 'PlayerB');
        assert.ok(det, 'Should detect PlayerB from modern bed break');
        assert.equal(det.args[1], 'bed_break');
    });
});

// ─── Section 5: Kill feed detection ───────────────────────────────────────────
describe('5. Kill feed (non-final)', () => {
    it('"PlayerA was killed by PlayerB" — detects PlayerA', () => {
        const names = detectedNames(parseLineEvents('Player_A was killed by Player_B'));
        assert.ok(names.includes('Player_A'), 'Should detect Player_A as victim');
    });

    it('"PlayerA killed PlayerB using sword" — detects both', () => {
        const names = detectedNames(parseLineEvents('KillerX killed VictimY using a sword'));
        assert.ok(names.includes('KillerX'), 'Should detect KillerX');
        assert.ok(names.includes('VictimY'), 'Should detect VictimY');
    });
});

// ─── Section 6: Team tags ─────────────────────────────────────────────────────
describe('6. Team tags', () => {
    it('[RED] PlayerA detected via team tag', () => {
        const det = parseLineEvents('[RED] PlayerA dealt 12 damage')
            .find(e => e.event === 'player_detected' && e.args[0] === 'PlayerA');
        assert.ok(det, 'Should detect PlayerA from team tag');
    });

    it('[BLUE] multiple players in scoreboard', () => {
        const names = detectedNames(parseLineEvents('[BLUE] TeamMate1 | [RED] TeamMate2'));
        assert.ok(names.includes('TeamMate1'), 'Should detect TeamMate1');
        assert.ok(names.includes('TeamMate2'), 'Should detect TeamMate2');
    });
});

// ─── Section 7: Tab-completion roster ─────────────────────────────────────────
describe('7. Tab-completion roster', () => {
    it('Tab list: valid comma-separated roster is parsed', () => {
        const roster = 'PlayerAlpha, PlayerBeta, PlayerGamma, PlayerDelta, PlayerEpsilon, PlayerZeta, PlayerEta, PlayerTheta';
        const evts = parseLineEvents(roster);
        assert.ok(evts.some(e => e.event === 'players_sync'), 'Should emit players_sync');
        assert.ok(detectedNames(evts).length >= 4, `Should detect at least 4 players (got ${detectedNames(evts).length})`);
    });

    it('Tab list with fewer than 3 items is NOT treated as roster', () => {
        assert.ok(!parseLineEvents('PlayerA, PlayerB').some(e => e.event === 'players_sync'),
            'Short CSV should NOT emit players_sync');
    });

    it('Tab list with kill keyword is NOT parsed as roster', () => {
        const evts = parseLineEvents('PlayerA, PlayerB, PlayerC was killed, PlayerD');
        assert.ok(!evts.some(e => e.event === 'players_sync'),
            'CSV with "killed" should not be treated as tab roster');
    });
});

// ─── Section 8: Game lifecycle ────────────────────────────────────────────────
describe('8. Game lifecycle events', () => {
    it('"the game starts in 5 seconds" triggers game_start', () => {
        assert.ok(parseLineEvents('the game starts in 5 seconds').some(e => e.event === 'game_start'));
    });

    it('"BedWars starting" triggers game_start', () => {
        assert.ok(parseLineEvents('BedWars starting!').some(e => e.event === 'game_start'));
    });

    it('"returning to lobby" triggers game_end + players_clear', () => {
        const evts = parseLineEvents('You are returning to lobby...');
        assert.ok(evts.some(e => e.event === 'game_end'), 'Should emit game_end');
        assert.ok(evts.some(e => e.event === 'players_clear'), 'Should emit players_clear');
    });

    it('"you were eliminated" triggers game_end', () => {
        assert.ok(parseLineEvents('You were eliminated from the game!').some(e => e.event === 'game_end'));
    });

    it('[Match Recap] line triggers game_end + players_clear', () => {
        const evts = parseLineEvents('[Match Recap] The game has ended!');
        assert.ok(evts.some(e => e.event === 'game_end'), 'Should emit game_end');
        assert.ok(evts.some(e => e.event === 'players_clear'), 'Should emit players_clear');
    });
});

// ─── Section 9: cleanName edge cases ──────────────────────────────────────────
describe('9. cleanName edge cases', () => {
    it('cleanName strips §6 color codes', () => {
        const result = cleanName('§6MVP§r PlayerABC');
        assert.ok(result, 'Should return a valid name');
        assert.match(result, /^[A-Za-z0-9_]{3,16}$/, `"${result}" is not a valid MC name`);
    });

    it('cleanName strips [MVP] rank prefix', () => {
        assert.equal(cleanName('[MVP] SomeName'), 'SomeName');
    });

    it('cleanName bracket username NOT stripped (short result protection)', () => {
        const result = cleanName('[OK]');
        assert.ok(result === null || (result && result.length >= 3),
            'cleanName should not return names shorter than 3 chars');
    });

    it('cleanName handles FFFD replacement character color codes', () => {
        assert.ok(cleanName('\uFFFD6PlayerABC'), 'Should handle FFFD color code replacement');
    });

    it('cleanName returns null for 2-char strings', () => {
        assert.equal(cleanName('AB'), null);
    });

    it('cleanName returns null for empty string', () => {
        assert.equal(cleanName(''), null);
    });

    it('cleanName handles names with decorative symbols prefix', () => {
        assert.ok(cleanName('★ PlayerZ99'), 'Should extract name after decorative prefix');
    });
});

// ─── Section 10: Real-world false positive scenarios ──────────────────────────
describe('10. Real-world false positive scenarios', () => {
    it('Pika welcome banner does not fire player_detected', () => {
        const lines = [
            '\u00a7b\u00a7lPika-Network \u00a7r\u00a77| \u00a7b\u00a7 lwww.pika-network.net',
            'Use \u00a7e/help \u00a7rto view all commands.',
            'Connected to \u00a7aBedWars-1\u00a7r server.',
            '→ \u00a7eYou have \u00a7a3 \u00a7emessages waiting.',
        ];
        for (const l of lines) {
            const det = detectedNames(parseLineEvents(l));
            assert.equal(det.length, 0, `False player detected "${det}" in line: "${l}"`);
        }
    });

    it('"Top Final Kills:" scoreboard — no false player_quit', () => {
        const quit = parseLineEvents('Top Final Kills:').find(e => e.event === 'player_quit');
        assert.ok(!quit, `BUG: "Top Final Kills:" triggers player_quit with victim="${quit?.args[0]}"`);
    });

    it('"1st Final Kills: PlayerX" scoreboard line — game_end, no false quit', () => {
        const evts = parseLineEvents('1st Final Kills: ProGamer99');
        assert.ok(evts.some(e => e.event === 'game_end'), '"1st Final Kills" should trigger game_end (recap line)');
        assert.ok(!evts.some(e => e.event === 'player_quit'), 'Should NOT emit player_quit for recap scoreboard lines');
    });
});

// ─── Section 11: Real log MOTD lines (§ → \uFFFD color codes) ─────────────────
describe('11. Real log MOTD noise (§ → \uFFFD color codes)', () => {
    it('MOTD "Welcome to PikaNetwork" with \uFFFD color codes — no player_detected', () => {
        const lines = [
            '\uFFFDe\uFFFDlWelcome to PikaNetwork',
            '\uFFFD7Currently playing with \uFFFDb2496 \uFFFD7other players!',
            '\uFFFDfMore \uFFFDe\uFFFDlPika\uFFFDc\uFFFDlNetwork\uFFFDf? Click below!',
            '\uFFFDfBuy \uFFFD6Gold\uFFFDf, \uFFFDaRanks\uFFFDf, and much \uFFFDdmore',
            '\uFFFDf at \uFFFDcstore.pika-network.net',
        ];
        for (const l of lines) {
            const det = detectedNames(parseLineEvents(l));
            assert.equal(det.length, 0, `False player detected "${det}" in MOTD line: "${l}"`);
        }
    });

    it('Navigation bar "SITE - STORE - VOTE - DISCORD" — not parsed as players', () => {
        const lines = [
            '   SITE \uFFFD7- STORE \uFFFD7- VOTE \uFFFD7- DISCORD ',
            '  TIKTOK \uFFFD7- YOUTUBE \uFFFD7- INSTA \uFFFD7- TWITTER ',
        ];
        for (const l of lines) {
            const det = detectedNames(parseLineEvents(l));
            assert.equal(det.length, 0, `False player detected in nav bar: "${l}"`);
        }
    });

    it('Guild "X Welcomes you to Pika Network" — not parsed as player', () => {
        const det = detectedNames(parseLineEvents('Guilds ? \uFFFD2Driiddy Welcomes you to Pika Network'));
        assert.equal(det.length, 0, 'Guild welcome should not detect players');
    });

    it('Friend "Online at BWLOBBY-xxx" server routing — not parsed as player', () => {
        const det = detectedNames(parseLineEvents('  \uFFFDa\uFFFDl? \uFFFDeaxtia \uFFFD7 \uFFFDaOnline \uFFFD7at \uFFFDfBWLOBBY-6m5wt-vz9tg'));
        assert.equal(det.length, 0, '"Online at BWLOBBY-..." should not detect players');
    });

    it('Friend "Last seen: XX-XX-XXXX" line — not parsed as player', () => {
        const det = detectedNames(parseLineEvents('  \uFFFD8\uFFFDl? \uFFFDeczarjob \uFFFD7 \uFFFD7Last seen: \uFFFD602-19-2026 12:54'));
        assert.equal(det.length, 0, '"Last seen:" friend entry should not detect players');
    });

    it('cleanName strips \uFFFD-prefixed color codes (real log format)', () => {
        const result = cleanName('\uFFFD6PlayerABC');
        assert.ok(result, 'Should return a name after stripping \uFFFD color code');
        assert.match(result, /^[A-Za-z0-9_]{3,16}$/, `"${result}" is not a valid MC name after \uFFFD strip`);
    });

    it('cleanName strips mixed § and \uFFFD color codes', () => {
        const result = cleanName('\uFFFDe\uFFFDlSomeName');
        assert.ok(result, 'Should extract name from \uFFFDe\uFFFDl prefix');
        assert.match(result, /^[A-Za-z0-9_]{3,16}$/, `"${result}" is not a valid MC name`);
    });
});

// ─── Section 12: getRankDisplay with object-array ranks ───────────────────────
describe('12. getRankDisplay with rank objects', () => {
    it('ranks as [{name, displayName}] objects returns correct rank', () => {
        const r = getRankDisplay({
            rank: { rankDisplay: '' },
            ranks: [{ name: 'MOD', displayName: 'Moderator' }, { name: 'HELPER', displayName: 'Helper' }],
        });
        assert.equal(r.text, 'MOD', 'Should detect MOD from object array ranks');
        assert.equal(r.color, '#00aa00', 'MOD should be green');
    });

    it('ranks as plain string array (backward compat)', () => {
        const r = getRankDisplay({ rank: { rankDisplay: '' }, ranks: ['MOD'] });
        assert.equal(r.text, 'MOD', 'Should detect MOD from string array');
    });

    it('donor rank from rankDisplay string', () => {
        const r = getRankDisplay({ rank: { rankDisplay: 'TITAN' }, ranks: [] });
        assert.equal(r.text, 'TITAN', 'Donor rank should come from rankDisplay');
        assert.equal(r.color, '#ff5555', 'TITAN should be red');
    });

    it('empty profile returns blank rank', () => {
        const r = getRankDisplay({ rank: { rankDisplay: '' }, ranks: [] });
        assert.equal(r.text, '', 'Empty profile should give empty rank text');
    });
});

// ─── Section 13: v2.2 Optimizations ───────────────────────────────────────────
describe('13. v2.2 Optimizations', () => {
    it('In-game team chat "BLUE AcquaPanna: message" — NOT detected as player', () => {
        const lines = [
            'BLUE AcquaPanna: no lol?',
            'AQUA Revaya: hf',
            'GRAY mdew: dude',
            'RED SomeName123: gg wp',
        ];
        for (const l of lines) {
            assert.equal(detectedNames(parseLineEvents(l)).length, 0,
                `Team chat should not detect player in: "${l}"`);
        }
    });

    it('"Team Upgrade ? Player purchased..." — NOT detected as player', () => {
        const det = detectedNames(parseLineEvents('Team Upgrade ? AcquaPanna purchased Sharpened Swords I.'));
        assert.equal(det.length, 0, 'Team Upgrade noise should be skipped entirely');
    });

    it('Real bed break format "Red Team\'s Bed has been destroyed by PlayerName"', () => {
        const lines = [
            "Red Team's Bed has been destroyed by AcquaPanna",
            "Yellow Team's Bed has been destroyed by ancientfreedom12",
            "Pink Team's Bed has been destroyed by mdew",
            "Blue Team's Bed has been destroyed by legend_295",
        ];
        for (const l of lines) {
            const det = parseLineEvents(l).find(e => e.event === 'player_detected' && e.args[1] === 'bed_break');
            assert.ok(det, `Should detect bed_break player in: "${l}"`);
            assert.match(det.args[0] as string, /^[A-Za-z0-9_]{3,16}$/,
                `Detected name "${det.args[0]}" is not a valid MC name`);
        }
    });

    it('FK possessive variant "ejevuzmsv\'s deal with ureyes has run out FINAL KILL"', () => {
        const quit = parseLineEvents("ejevuzmsv's deal with ureyes has run out FINAL KILL")
            .find(e => e.event === 'player_quit');
        assert.ok(quit, 'Should emit player_quit');
        assert.equal(quit.args[0], 'ejevuzmsv', 'Victim should be ejevuzmsv (possessive form)');
    });

    it('FK "slipped into the void" variant', () => {
        const quit = parseLineEvents('melosdarian slipped into the void for Gerberas FINAL KILL')
            .find(e => e.event === 'player_quit');
        assert.ok(quit, 'Should emit player_quit for void FK');
        assert.equal(quit.args[0], 'melosdarian');
    });

    it('FK "was distracted by a piglet" variant with [x2]', () => {
        const quit = parseLineEvents('somikasomi2 got attacked by a carrot from Gerberas FINAL KILL [x2]')
            .find(e => e.event === 'player_quit');
        assert.ok(quit, 'Should emit player_quit for [x2] carrot FK');
        assert.equal(quit.args[0], 'somikasomi2');
    });

    it('FK "was irradiated by" variant', () => {
        const quit = parseLineEvents('PRO_Raghav was irradiated by b4death_ FINAL KILL')
            .find(e => e.event === 'player_quit');
        assert.ok(quit, 'Should emit player_quit for irradiated FK');
        assert.equal(quit.args[0], 'PRO_Raghav');
    });

    it('Coin gain "+3 coins" — not parsed as player', () => {
        assert.equal(detectedNames(parseLineEvents('+3 coins')).length, 0);
    });

    it('"+ 1 Golden Ingot" resource gain — not parsed as player', () => {
        assert.equal(detectedNames(parseLineEvents('+ 1 Golden Ingot')).length, 0);
    });

    it('Tab list with ": " in it (team chat) — not parsed as roster', () => {
        const evts = parseLineEvents('Alpha, Beta, Charlie: say hello, Delta');
        assert.ok(!evts.some(e => e.event === 'players_sync'),
            'CSV with ": " (chat message) should NOT be treated as tab roster');
    });
});

// ─── Section 14: Party tracking ───────────────────────────────────────────────
describe('14. Party tracking (join / leave / /p info)', () => {
    it('Party join: "Party ✦ ✦ AcquaPanna joined the party!" emits party_joined', () => {
        const e = parseLineEvents('Party \u2726 \u2726 AcquaPanna joined the party!')
            .find(e => e.event === 'party_joined');
        assert.ok(e, 'Should emit party_joined');
        assert.equal(e.args[0], 'AcquaPanna', 'Joined player should be AcquaPanna');
    });

    it('Party join with color codes in name prefix: still extracts correct username', () => {
        const e = parseLineEvents('Party \u2726 \u2726 \uFFFDd[VIP]\uFFFDr DashKiller joined the party!')
            .find(e => e.event === 'party_joined');
        assert.ok(e, 'Should emit party_joined even with rank prefix');
        assert.equal(e.args[0], 'DashKiller', 'Should extract DashKiller, not the rank prefix');
    });

    it('Party leave: "Party ✦ ✦ Rorshaurya has left the party." emits party_left', () => {
        const e = parseLineEvents('Party \u2726 \u2726 Rorshaurya has left the party.')
            .find(e => e.event === 'party_left');
        assert.ok(e, 'Should emit party_left');
        assert.equal(e.args[0], 'Rorshaurya', 'Left player should be Rorshaurya');
    });

    it('Party leave short form: "Party ✦ ✦ PlayerX left the party." emits party_left', () => {
        const e = parseLineEvents('Party \u2726 \u2726 PlayerX left the party.')
            .find(e => e.event === 'party_left');
        assert.ok(e, 'Should emit party_left for short form');
        assert.equal(e.args[0], 'PlayerX');
    });

    it('Party kicked: "Party ✦ ✦ BadPlayer has been kicked from the party." emits party_left', () => {
        const e = parseLineEvents('Party \u2726 \u2726 BadPlayer has been kicked from the party.')
            .find(e => e.event === 'party_left');
        assert.ok(e, 'Should emit party_left for kick');
        assert.equal(e.args[0], 'BadPlayer');
    });

    it('Party disband: "Party ✦ The party has been disbanded." emits party_clear', () => {
        assert.ok(parseLineEvents('Party \u2726 The party has been disbanded.').some(e => e.event === 'party_clear'));
    });

    it('Party self-left: "Party ✦ You have left the party." emits party_clear', () => {
        assert.ok(parseLineEvents('Party \u2726 You have left the party.').some(e => e.event === 'party_clear'));
    });

    it('/p info "Party ✦ Party Members (3): DashKiller, AcquaPanna, clockburg" emits party_members', () => {
        const e = parseLineEvents('Party \u2726 Party Members (3): DashKiller, AcquaPanna, clockburg')
            .find(e => e.event === 'party_members');
        assert.ok(e, 'Should emit party_members from /p info');
        assert.ok((e.args[0] as string[]).includes('DashKiller'), 'Should contain DashKiller');
        assert.ok((e.args[0] as string[]).includes('AcquaPanna'), 'Should contain AcquaPanna');
        assert.ok((e.args[0] as string[]).includes('clockburg'), 'Should contain clockburg');
        assert.equal((e.args[0] as string[]).length, 3, 'Should have exactly 3 party members');
    });

    it('/p info with ✦ prefix (non-Party start): "  ✦ Members: DashKiller, AcquaPanna, clockburg"', () => {
        const e = parseLineEvents('  \u2726 Members: DashKiller, AcquaPanna, clockburg')
            .find(e => e.event === 'party_members');
        assert.ok(e, 'Should emit party_members from non-"Party" prefixed member list');
        assert.ok((e.args[0] as string[]).includes('DashKiller'), 'Should contain DashKiller');
        assert.ok((e.args[0] as string[]).length >= 2, 'Should detect at least 2 members');
    });

    it('/p info member list with single name: NOT emitted (too few to be reliable)', () => {
        assert.ok(!parseLineEvents('Members: DashKiller').some(e => e.event === 'party_members'),
            'Single-name member list should NOT emit party_members (false-positive guard)');
    });

    it('Party chat message "Party ✦ DashKiller: gg wp" does NOT emit player_detected', () => {
        assert.equal(detectedNames(parseLineEvents('Party \u2726 DashKiller: gg wp')).length, 0);
    });

    it('Party chat message does NOT emit player_detected (second variant)', () => {
        assert.equal(detectedNames(parseLineEvents('Party \u2726 clockburg: need 1 more')).length, 0);
    });

    it('Party invite message — no player_detected', () => {
        const det = detectedNames(parseLineEvents('Party \u2726 DashKiller invited you to join his/her party!'));
        assert.equal(det.length, 0, 'Party invite should not detect players');
    });

    it('Party join emits party_joined AND NOT player_detected or players_sync', () => {
        const evts = parseLineEvents('Party \u2726 \u2726 TestUser99 joined the party!');
        assert.ok(evts.some(e => e.event === 'party_joined'), 'Should emit party_joined');
        assert.ok(!evts.some(e => e.event === 'player_detected'), 'Should NOT emit player_detected');
        assert.ok(!evts.some(e => e.event === 'players_sync'), 'Should NOT emit players_sync');
    });

    it('Party leave emits party_left AND NOT players_sync', () => {
        const evts = parseLineEvents('Party \u2726 \u2726 TestUser99 has left the party.');
        assert.ok(evts.some(e => e.event === 'party_left'), 'Should emit party_left');
        assert.ok(!evts.some(e => e.event === 'players_sync'), 'Should NOT emit players_sync');
        assert.ok(!evts.some(e => e.event === 'player_detected'), 'Should NOT emit player_detected');
    });
});

// ─── Section 15: Party owner — BLC color-code format (root-cause regression) ──
describe('15. Party owner BLC color-code format (root-cause fix regression)', () => {
    it('BLC /p info: color-coded "\\uFFFD8 Owner: \\uFFFDaAcquaPanna" buffers owner correctly', () => {
        const evts = parseSequenceEvents([
            '\uFFFD8 Owner: \uFFFDaAcquaPanna',
            '\uFFFD8 Members: \uFFFD7DashKiller, \uFFFD7clockburg',
        ]);
        const e = evts.find(e => e.event === 'party_members');
        assert.ok(e, 'Should emit party_members');
        assert.ok((e.args[0] as string[]).some(n => n.toLowerCase() === 'acquapanna'),
            `Owner AcquaPanna should be in members list. Got: ${JSON.stringify(e.args[0])}`);
        assert.ok((e.args[0] as string[]).some(n => n.toLowerCase() === 'dashkiller'), 'DashKiller should be in list');
        assert.ok((e.args[0] as string[]).some(n => n.toLowerCase() === 'clockburg'), 'clockburg should be in list');
    });

    it('BLC /p info: full block with separator lines and color codes', () => {
        const evts = parseSequenceEvents([
            '\uFFFD8\uFFFDm\uFFFD8-----------------------------------------------------',
            '\uFFFD8 Party Members (3)',
            '\uFFFD8 Owner: \uFFFDaAcquaPanna',
            '\uFFFD8 Members: \uFFFD7DashKiller, \uFFFD7clockburg',
            '\uFFFD8\uFFFDm\uFFFD8-----------------------------------------------------',
        ]);
        const e = evts.find(e => e.event === 'party_members');
        assert.ok(e, 'Should emit party_members from full BLC block');
        assert.ok((e.args[0] as string[]).some(n => n.toLowerCase() === 'acquapanna'),
            `Owner AcquaPanna missing. Got: ${JSON.stringify(e.args[0])}`);
        assert.equal((e.args[0] as string[]).length, 3, 'Should have exactly 3 members (owner + 2)');
    });

    it('BLC /p info: Format D — "Party Members (3)" header then color-coded Owner/Members', () => {
        const evts = parseSequenceEvents([
            'Party \u2726 Party Members (3)',
            'Owner: AcquaPanna',
            'Members: DashKiller, clockburg',
        ]);
        const e = evts.find(e => e.event === 'party_members');
        assert.ok(e, 'Should emit party_members for Format D');
        assert.ok((e.args[0] as string[]).some(n => n.toLowerCase() === 'acquapanna'),
            `Owner AcquaPanna missing in Format D. Got: ${JSON.stringify(e.args[0])}`);
    });

    it('BLC /p info: owner with rank tag in BLC format', () => {
        const evts = parseSequenceEvents([
            '\uFFFD8 Owner: \uFFFDc[MVP+]\uFFFDr AcquaPanna',
            '\uFFFD8 Members: \uFFFD7DashKiller, \uFFFD7clockburg',
        ]);
        const e = evts.find(e => e.event === 'party_members');
        assert.ok(e, 'Should emit party_members with rank-tagged owner');
        assert.ok((e.args[0] as string[]).some(n => n.toLowerCase() === 'acquapanna'),
            `Owner with rank tag not extracted. Got: ${JSON.stringify(e.args[0])}`);
    });

    it('BLC /p info: Party prefix format still works after fix', () => {
        const evts = parseSequenceEvents([
            'Party \u2726 Owner: AcquaPanna',
            'Party \u2726 Members: DashKiller, clockburg',
        ]);
        const e = evts.find(e => e.event === 'party_members');
        assert.ok(e, 'Party-prefixed format should still work');
        assert.ok((e.args[0] as string[]).some(n => n.toLowerCase() === 'acquapanna'),
            'Owner must be in Party-prefixed result');
        assert.equal((e.args[0] as string[]).length, 3, 'Should have 3 members');
    });
});

// ─── Section 16: Real Pika log format (✦ prefix, U+2726) ──────────────────────
describe('16. Real Pika log format (✦ prefix, U+2726)', () => {
    it('Real log: "  ✦ Owner: daksh_pokiemon" + "  ✦ Members: (1) AcquaPanna" emits party_members', () => {
        const evts = parseSequenceEvents([
            '  \u2726 Your Party',
            '  \u2726 Owner: daksh_pokiemon',
            '  \u2726 Members: (1) AcquaPanna\uFFFDr\uFFFD7',
        ]);
        const e = evts.find(e => e.event === 'party_members');
        assert.ok(e, 'Should emit party_members from real log format');
        assert.ok((e.args[0] as string[]).some(n => n.toLowerCase() === 'daksh_pokiemon'),
            `Owner daksh_pokiemon missing. Got: ${JSON.stringify(e.args[0])}`);
        assert.ok((e.args[0] as string[]).some(n => n.toLowerCase() === 'acquapanna'),
            `Member AcquaPanna missing. Got: ${JSON.stringify(e.args[0])}`);
        assert.equal((e.args[0] as string[]).length, 2, 'Should have exactly 2 members (owner + 1)');
    });

    it('Real log: party of 3 with ✦ prefix', () => {
        const evts = parseSequenceEvents([
            '  \u2726 Your Party',
            '  \u2726 Owner: daksh_pokiemon',
            '  \u2726 Members: (2) AcquaPanna, clockburg',
        ]);
        const e = evts.find(e => e.event === 'party_members');
        assert.ok(e, 'Should emit party_members for 3-member party');
        const members = e.args[0] as string[];
        assert.ok(members.some(n => n.toLowerCase() === 'daksh_pokiemon'), 'Owner must be present');
        assert.ok(members.some(n => n.toLowerCase() === 'acquapanna'), 'AcquaPanna must be present');
        assert.ok(members.some(n => n.toLowerCase() === 'clockburg'), 'clockburg must be present');
        assert.equal(members.length, 3, 'Should have exactly 3 members');
    });

    it('Real log: self as owner with ✦ prefix', () => {
        const evts = parseSequenceEvents([
            '  \u2726 Your Party',
            '  \u2726 Owner: AcquaPanna',
            '  \u2726 Members: (1) daksh_pokiemon\uFFFDr\uFFFD7',
        ]);
        const e = evts.find(e => e.event === 'party_members');
        assert.ok(e, 'Should emit party_members when self is owner');
        const members = e.args[0] as string[];
        assert.ok(members.some(n => n.toLowerCase() === 'acquapanna'),
            'Self (AcquaPanna) as owner must be present');
        assert.ok(members.some(n => n.toLowerCase() === 'daksh_pokiemon'),
            'Member daksh_pokiemon must be present');
    });
});

// ─── Section 17: "Not in a party" reset ───────────────────────────────────────
describe('17. "Not in a party" reset (/p info when solo)', () => {
    it('"Party ✦ You are not currently in a party." emits party_clear', () => {
        assert.ok(parseLineEvents('Party \u2726 You are not currently in a party.').some(e => e.event === 'party_clear'),
            'Should emit party_clear when not in a party (with Party prefix)');
    });

    it('"Party ✦ You are not in a party." emits party_clear (short variant)', () => {
        assert.ok(parseLineEvents('Party \u2726 You are not in a party.').some(e => e.event === 'party_clear'),
            'Should emit party_clear for short "not in a party" variant');
    });

    it('"You are not currently in a party." without Party prefix emits party_clear', () => {
        assert.ok(parseLineEvents('You are not currently in a party.').some(e => e.event === 'party_clear'),
            'Should emit party_clear even without "Party" prefix');
    });

    it('"You are not in a party." without Party prefix emits party_clear', () => {
        assert.ok(parseLineEvents('You are not in a party.').some(e => e.event === 'party_clear'),
            'Should emit party_clear for short variant without prefix');
    });

    it('"Not in a party" with BLC color codes emits party_clear', () => {
        const evts = parseSequenceEvents(['Party \u2726 \uFFFDeYou are not currently in a party.']);
        assert.ok(evts.some(e => e.event === 'party_clear'),
            'Should emit party_clear even with color codes in the message');
    });

    it('"Not in a party" does NOT emit player_detected', () => {
        assert.equal(detectedNames(parseLineEvents('You are not currently in a party.')).length, 0,
            '"not in a party" message should never detect players');
    });
});
