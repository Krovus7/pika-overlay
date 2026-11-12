# ADR-0010 — Player status model, API key and rate budget (v5)

**Status:** Accepted

## Context
Three things were wrong with the v4 lookup model once checked against the
live API on 2026-11-12 (facts in `docs/API-CLIENT.md`):

1. The Pika stats API started requiring a personal key (`X-Api-Key`, obtained
   in-game with `/apikey`). v4 sends none, so every lookup failed with 401 and
   was shown as a generic per-row error.
2. "API Off" was inferred from "profile exists, no BedWars data". That also
   matched accounts that never played BedWars and anyone with no games in the
   selected week/month/mode. The API actually states privacy explicitly: the
   leaderboard answers `204` for a private player.
3. "Nicked" was any profile 404, including names the user mistyped in the
   search box. And three independent booleans (`notFound`, `nicked`, `apiOff`)
   plus `error` let impossible combinations exist.

The API also publishes its budget (120 requests/minute, `X-RateLimit-*`
headers), which v4 ignored and answered with per-request retries.

## Decision
- One discriminated `status` on every lookup result: `ok`, `nicked`,
  `not_found`, `api_off`, `never_played`, `no_data`, `error`, `rate_limited`,
  `auth`. The legacy booleans are removed. All results travel on
  `player:stats`; the `player:error` event is removed.
- Classification follows the table in `docs/API-CLIENT.md`. `api_off` only
  from the 204 answer. A 404 is `nicked` only when the name was seen in the
  game; typed names stay `not_found`. Server errors are `error`, never a
  status that looks like a fact about the player.
- The key lives in config (`apiKey`). Missing/rejected key is a global
  `ApiHealth` state shown as one banner; no request is sent meanwhile.
- A header-driven rate gate holds requests until the window resets; profile
  and leaderboard are fetched in parallel; the profile is cached separately so
  period/mode switches cost one request per player; the cache survives game
  start.
- The registry remembers each player's source so re-fetches (period switch,
  retry, key change) keep it.

## Consequences
- Row states are facts the API returned, not guesses; "NICKED" stops firing
  on typos and "API OFF" stops firing on new accounts and quiet weeks.
- Users must enter a key once (Settings → API). Without it the overlay says so
  instead of showing errors.
- Roughly half the requests per game compared to v4 (no double fetch across
  lobby → game, cached profiles), and no 429 storms.
- Breaking change for the renderer contract and the API tests (rewritten).

## Alternatives
- Keep the booleans and add more: rejected — the bug class was the booleans.
- Detect privacy with the `/history` endpoint (also 204): rejected — the
  leaderboard request we already make gives the same answer for free.
- Read the key from chat when the player types `/apikey`: not done — the
  chat line format is unverified (no sample in any local log).

## Implementation notes
- `src/shared/types.ts` (`PlayerResult`, `ApiHealth`), `src/shared/ipc-contract.ts`.
- `src/main/api/` — key/health, rate gate, fetch, classification, caches.
- `src/main/ipc/lookup.ts` — `not_found` → `nicked` by source; refresh path.
- `renderer/` — status pills, health banner.

## Validation
- Unit tests per row of the decision table, rate gate with injected clock.
- `scripts/live-api-check.mjs` against the real API with a real key
  (results recorded in `docs/VERIFICATION-2026-11.md`).
