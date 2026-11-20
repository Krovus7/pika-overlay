# API-CLIENT.md

`src/main/api/` — client for `https://stats.pika-network.net/api`.
Official docs: <https://stats.pika-network.net/docs> (OpenAPI:
`https://stats.pika-network.net/openapi.json`, community-maintained — "the API
itself can change without notice").

## Verified facts (live, 2026-11-12)

Every statement below was observed against the real API with a real key.

| Fact | Observation |
|---|---|
| **Key required** | Every request needs `X-Api-Key`. Players get a key in-game: `/linkaccount` (Discord) then `/apikey`; `/apikey reset` replaces it. One key per account, no expiry. |
| No key | `401 {"error":"api key required", ...}` |
| Wrong key | `401 {"error":"invalid api key", ...}` |
| **Rate limit** | 120 requests / minute per key. Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (seconds until the window resets). Over the limit: `429` + `Retry-After`. |
| Case | Usernames are not case-sensitive on any endpoint. |
| Profile, known player | `GET /profile/{name}` → `200` (`username`, `rank.level`, `rank.rankDisplay`, `ranks[]`, `clan`, `lastSeen`, …) |
| Profile, unknown name | `404`, empty body |
| Leaderboard, public player | `GET /profile/{name}/leaderboard?type=bedwars&interval=…&mode=…` → `200`, one key per stat: `{"Kills":{"metadata":{"total":N},"entries":[{"place":P,"value":"19","id":"name"}]}, …}` |
| Leaderboard, all-null at a high level | Observed 2026-11-14: an account at level 33 with a rank, a clan and Practice games answered all-null BedWars entries for every mode and every interval. The API does not say whether such a player never played BedWars or is simply not published, so the row note is "no public BedWars stats" above level 5 and "new account, no BedWars games" up to level 5 (`renderer/ts/table/statusRow.ts`). |
| Leaderboard, no data | `200` with `"entries": null` on **every** key — identical for "never played BedWars" and "did not play in this interval/mode" |
| **Leaderboard, private stats** | `204`, empty body (profile is still `200`) |
| Leaderboard, unknown name | `400`, empty body |
| Leaderboard, bad params | `400` with a JSON error body |
| Intervals | `total`, `weekly`, `monthly`, `yearly` |
| BedWars modes | `ALL_MODES`, `SOLO`, `DOUBLES`, `TRIPLES`, `QUAD` |

One player costs two requests (profile + leaderboard), fetched in parallel.

### `lastSeen` (observed 2026-11-14; meaning not verified)

| Fact | Observation |
|---|---|
| Field | `GET /profile/{name}` returns `lastSeen`, epoch milliseconds, among `discord_verified, lastSeen, ranks, email_verified, discord_boosting, clan, skin, rank, friends, username`. There is no UUID field. |
| Cost | none: the profile is already fetched for every lookup and cached for 10 minutes |
| Values seen | three players who were online in the same hub had `lastSeen` about 4 minutes, 20 minutes and 28 hours before the moment they were seen, so it is not refreshed while a player is online |
| **Meaning** | **NOT verified**: it is either the last login or the last logout. `scripts/last-seen-probe.mjs` (`PIKA_API_KEY=<key> node scripts/last-seen-probe.mjs <name> [--every 60] [--minutes 20]`) polls one profile once a minute to settle it; it has not been run yet |

The client keeps `lastSeen` only when it is a finite number between 2015-01-01
and now plus 5 minutes, otherwise `null` (`profileInfo` in
`statsExtractor.ts`); `no_data` results keep it. Because the meaning is open,
the login-age chip ships **off by default** in 5.2.0-beta.1 (`loginAge: 'off'`)
and its hover text only says "Last seen on Pika <time> ago (Pika profile)".

## Classification (ADR-0010)

`getPlayerStats` returns a `PlayerResult` whose `status` is the single source
of truth (`src/shared/types.ts`).

| Profile | Selected leaderboard | Status |
|---|---|---|
| 401 (either request) | — | `auth` — health becomes `key_invalid` |
| no key configured | — | `auth` — no network call, health `key_missing` |
| 404 | — | `not_found` → the lookup layer turns it into `nicked` when the name came from the game (not typed by the user) |
| 429 / 503 after retries (either) | — | `rate_limited` |
| timeout, network error, 403, 5xx, other non-ok, invalid JSON (either) | — | `error` — never `api_off`, never a key problem |
| 200 | 204 | `api_off` — stats are private (certain) |
| 200 | 200 with data | `ok` |
| 200 | 200 all-null, selection `total` + `ALL_MODES` | `never_played` (shown as NO STATS; see the note below) |
| 200 | 200 all-null, any other selection | look at `total`/`ALL_MODES` (cached): data → `no_data`, all-null → `never_played`, 204 → `api_off` |

Why this matters:

- **Nicked**: Pika's nick system only hands out names that never joined the
  server, so a live player whose name returns 404 is nicked. The same 404 on a
  name the user typed is more likely a typo, hence `not_found`.
- **API off** used to be a guess ("profile exists but no BedWars data"). That
  guess was wrong in two directions: it flagged accounts that simply never
  played BedWars, and anyone who had not played in the selected week/month.
  The 204 answer is the API's own statement that the stats are private.
- **Never played** in a live game means a brand-new account or a fresh alt —
  useful on its own, so it is not folded into `api_off`.

## Health

One global `ApiHealth` signal (`ok`, `key_missing`, `key_invalid`,
`rate_limited` with `retryAt`, `unreachable`) is pushed to the overlay on the
`api:health` event, so a missing key or an exhausted budget is one banner
instead of an error on every row. While the key is missing or rejected no
request is sent.

## Rate budget

The client reads `X-RateLimit-Remaining` / `X-RateLimit-Reset` on every
response and holds requests until the window resets instead of running into
429s. A 429/503 pauses all requests for `Retry-After` (or the reset time).

## Caching

- Profile cache (10 min; a 404 for 3 min) is separate from the stats cache, so
  switching period or mode costs one request per player instead of two.
- Stats cache key `user:interval:mode` (`ok` 10 min; `api_off`,
  `never_played`, `no_data` 3 min). `error`, `rate_limited` and `auth` are
  never cached.
- Concurrent requests for the same key share one network round.
- The cache is no longer cleared on game start / lobby change (TTL keeps it
  fresh and players seen in the pre-game lobby are detected again in-game);
  the manual clear still clears it.
- **Own row and party are always fresh.** Their stats change with every match
  played together, so the cache is skipped for them (`ApiCache.forget`): on
  party events and each time the user's own pre-game join appears (a new
  lobby, at most once per 20 s). A row that already shows a result is updated
  in place — no loading state, and a failed attempt keeps the previous result
  (`LookupService`, `src/main/ipc/lookup.ts`). Cost: two requests per party
  member per lobby.
- The **refresh button** in the title bar (`players:refresh`) empties the
  cache and re-fetches every shown row.

## Rank display (`rankDisplay.ts`)

Donor ranks (TITAN/LEGEND/LORD/MVP/VIP/PRO/ULTRA) come from
`profile.rank.rankDisplay` (substring match); staff ranks (OWNER…MEDIA) from
`profile.ranks`, normalized to accept both `[{name}]` objects and plain
strings.

## Testing

`tests/api.test.ts` mocks `globalThis.fetch`; the rate limiter takes an
injected clock. `scripts/live-api-check.mjs` runs the real client against the
real API and needs `PIKA_API_KEY` in the environment — it is not part of the
automated suite. Never commit a key.
