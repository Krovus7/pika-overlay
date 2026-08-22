# TESTING.md

Framework: `node:test` (built-in, zero deps — ADR-0006). Tests are
TypeScript, compiled by `tsc` into `dist/tests/`.

```
npm test          # build + node --test "dist/tests/*.test.js"
npm run typecheck # tsc main + tsc renderer (noEmit)
```

## Suites

| Suite | Covers |
|---|---|
| `tests/log-parser.test.ts` | 17 sections ported 1:1 from v3 `test_logwatcher.js`: lobby noise, pre-game join/quit, final kills (all known formats), bed breaks, kill feed, team tags, tab roster, game lifecycle, `cleanName` edge cases, MOTD false positives, party tracking, BLC/✦ `/p info` formats, not-in-party reset, `getRankDisplay`. **Green = non-regression contract for the parser.** |
| `tests/config.test.ts` | defaults, clamps (opacity), invalid enums, column merge, v3 legacy migration (flat thresholds + `fkdrThresholds`, v3 precedence `rt.good ?? ft.good ?? 3`), file store, `.bak` backup, corrupt file, persist/reload |
| `tests/state.test.ts` | playerRegistry (case keys, clearExcept), partyState, gameState, lookupQueue (concurrency bound, FIFO, worker errors) |
| `tests/api.test.ts` | mocked fetch: 404→nicked, 429/503→rateLimited, timeout→error, 200→stats with ratios, zero-division guards, api-off, cache keys, rank mapping |

## Contract rules for contributors

1. Never change parser semantics without the ported suite green.
2. Mock the fetch (or pass `retryOptions`); never hit the real API in tests.
3. New behavior → new test in the matching suite; config schema changes →
   migration tests with the legacy shapes.
4. A mock that fakes the real behavior is not coverage (R7).

## Gate

Code-Verified = `npm run typecheck` + `npm test` green. Field-Verified is a
separate gate (manual checklist on Pika, Badlion and vanilla — see the plan
"Validazione" section); the two must never be conflated (R5).
