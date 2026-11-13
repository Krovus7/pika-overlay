# ADR-0012 — The table follows the lobby; Pika match start recognised (v5)

**Status:** Accepted

## Context
Replaying the local log corpus (56 session logs, 174 real Pika BedWars
matches) through the parser showed that `game_start` fired in none of them.
The patterns inherited from v3 (`the game starts in N second`, `game is
starting`) match another server's countdown; Pika prints
`The game will start in N seconds.` as a countdown and
`Goodluck with your BedWars Game` when the match begins.

So everything attached to `game_start` was dead code on Pika: the "In game"
status, the removal of every non-party row at the start, and the lock that
ignored tab rosters during a match. What users actually had for months was:
the pre-game roster stays through the match, final kills remove rows, and a
tab roster works at any time. The corpus shows that this is relied on: a tab
roster was requested during a match 27 times, typically right after the start
to load players who were in the lobby before the user (average roster at
start: 13.2 players). Of those 27 rosters, 4 brought back 8 players who had
already been eliminated (they stay on the server as spectators).

Simply making the old `game_start` fire would have emptied the table at the
start of every match and disabled the mid-match roster.

## Decision
- The parser emits `game_start` on Pika's start line. The countdown is not a
  start (players still join and quit during it).
- The table follows the lobby: it is emptied on `players_clear` (own join of
  a new lobby, match recap, server change), never on `game_start`.
- A tab roster applies before and during a match: rows not listed are removed
  (party members stay pinned), missing players are added.
- Players removed after the match start (final kill) are remembered as
  eliminated until the lobby changes; a tab roster does not add them again.

## Consequences
- The status pill shows "In game" during a match for the first time on Pika.
- No behaviour that users relied on is lost; spectators no longer reappear.
- A tab roster of a partial name completion still prunes the table to the
  listed names, as before (not distinguishable from a full roster).
- The v5 parser now differs from the frozen v3 reference in exactly one way;
  `scripts/replay-logs.mjs` counts those events separately (`pikaMatchStarts`)
  and still fails on any other divergence.

## Alternatives
- Keep the v3 semantics and only fix the pattern: rejected — it would empty
  the table at every match start.
- Use the last countdown line (`start in 1 second`) as the start: rejected —
  countdowns restart when players leave; the start line is unambiguous.
- Ignore tab rosters during a match (the v3 intent): rejected — the corpus
  shows the roster is requested during matches and is the only way to load
  players who were in the lobby first.

## Implementation notes
- `src/main/log/patterns.ts` (`RE_GAME_START_PIKA`), `src/main/log/lineParser.ts`.
- `src/main/state/gameState.ts` (match flag, eliminated set),
  `src/main/watcherBindings.ts`.
- `renderer/ts/overlay.ts`: `game:start` only sets the status pill.

## Validation
- `tests/log-parser.test.ts` (start line, countdown), `tests/state.test.ts`
  (`GameState`), `tests/watcher-bindings.test.ts` (table rules).
- `scripts/replay-logs.mjs` over the corpus: 174 Pika match starts, 0 other
  divergences from the v3 reference parser, 0 false-positive names.
- Session simulation: `docs/VERIFICATION-2026-11.md`.
