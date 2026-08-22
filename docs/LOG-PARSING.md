# LOG-PARSING.md

The log parser is a 1:1 port of v3 `src/logWatcher.js` split into
`src/main/log/{patterns,lineParser,partyParser,nameCleaner,logWatcher}.ts`.
The operation ORDER below is contractual — the test suite
(`tests/log-parser.test.ts`, 17 sections ported from v3) certifies it. Do not
change semantics without turning that suite green.

## `LineParser.parseLine` order (critical)

1. `RE_CHAT.exec(line)` — extract the message after `[CHAT]`.
2. `msg = chat[1].replace(RE_COLOR_CODE, '').trim()` — strip `§`/`\uFFFD`
   color codes BEFORE trim (v2.8.5 root-cause fix: residual spaces after the
   strip must be removed so `^`-anchored party regexes match).
3. Party events: any `^Party\b` line is consumed by `PartyParser.tryEvent`
   (never reaches RE_SKIP or the tab-list detector).
4. `/p info` member lists without the "Party" prefix:
   `PartyParser.tryMemberList`.
5. `RE_NOT_IN_PARTY` → `party_clear`.
6. `RE_SKIP` noise filter (guild/party/friends chat, lobby joins, MOTD,
   nav bar, team chat, upgrades, coins, etc. — see `patterns.ts`).
7. Game lifecycle — **`RE_GAME_END_RECAP` BEFORE `RE_FINAL_KILL_LINE`**:
   recap/scoreboard lines (`Top Final Kills:`, `1st Final Kills: …`,
   `[Match Recap]`) must emit `game_end` + `players_clear`, never a ghost
   `player_quit`. Then `RE_GAME_START_1/2`, `RE_GAME_END_ELIM`,
   `RE_SERVER_CHANGE`.
8. BedWars pre-game join/quit (`RE_BW_JOIN`/`RE_BW_QUIT`). Self-join →
   `players_clear` + `pregame_start`; first foreign join also emits
   `pregame_start` (once).
9. `RE_FINAL_KILL_LINE` — victim = **`RE_FIRST_TOKEN`** on the prefix
   (`/^([A-Za-z0-9_]{3,16})\b/`), never `cleanName` (over-extraction risk).
10. Kill feed — `RE_KILL_VICTIM` (victim) and `RE_KILL_KILLER` (both names):
    detection only, no removal.
11. Bed break — `RE_BED_BREAK` then `RE_BED_BREAK_MODERN`; emits
    `player_detected(name, 'bed_break')` and returns.
12. Team tags — `RE_TEAM_TAG` (global regex: `lastIndex` reset to 0 before
    the loop). No early return: execution may fall through to step 13.
13. Tab list — only if `msg` contains `,` and none of `' joined'`,
    `' killed'`, `': '`. Threshold: ≥ 3 valid names AND > 60 % of the comma
    tokens valid (v2.7 hardening).

## Party parser

- `_pendingPartyOwner` buffer: an `Owner:`/`Leader:` line stores the owner;
  the following `Members:` line emits ONE `party_members` event with
  owner + members (owner de-duplicated).
- Regex `RE_PARTY_OWNER` / `RE_PARTY_MEMBERS` / `RE_MEMBER_LIST` start with
  `^[^\w]*` to skip ✦ (U+2726), dashes, spaces (v2.8.5/v2.8.6 formats).
- `RE_PARTY_DISBAND` is tested BEFORE `RE_PARTY_LEFT`, otherwise
  "You have left the party" would match `RE_PARTY_LEFT` with `have` as
  username.
- Single-name member lists are NOT emitted (false-positive guard); zero
  valid names preserve the pending owner.

## `cleanName` (nameCleaner.ts)

- Strips `§`/`\uFFFD` codes, bracket/angle/brace/paren/pipe prefixes (only if
  ≥ 3 alphanumerics remain — the v2.1 bracket-autocomplete safeguard), and
  leading non-word decorations.
- Multi-word input → first word not in the rank/noise blocklist
  (`mvp`, `titan`, `helper`, `afk`, …) and not a common grammar word.
- Returns `null` when nothing valid remains (always guard with
  `RE_MC_NAME.test`).

## LogWatcher (poller)

- `fs.openSync/readSync` manual reads every 500 ms (deliberately NOT
  `fs.watch` — missed events with actively-written log files on Windows).
- File rotation handled via size regression (`pos = 0`); locked files are
  retried next tick.
