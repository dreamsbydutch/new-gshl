# Yahoo Fantasy helpers

Utilities in this folder wrap the Yahoo Fantasy Sports v2 XML API with first-class TypeScript
contracts. They power the league data sync scripts and are available to any server-side code via
the `@gshl-yahoo` path alias.

**Apps Script integration:** `apps-script/features/scrapers/YahooScraper.js` is the production job
that calls Yahoo, enriches rosters, and writes PlayerDay + TeamDay rows. It leans on helpers from
`apps-script/core/utils.js` (legacy `yahooTableScraper`) and shares the same OAuth credentials and
schema contracts described below. Whenever you add a new endpoint helper or change the response
shape, update both the TypeScript utilities _and_ the Apps Script scraper to keep parity.

## Prerequisites

Configure Yahoo OAuth credentials in your environment so token refreshes can occur seamlessly:

| Variable              | Required | Notes                                                                  |
| --------------------- | -------- | ---------------------------------------------------------------------- |
| `YAHOO_CLIENT_ID`     | ✅       | Consumer key from your Yahoo project                                   |
| `YAHOO_CLIENT_SECRET` | ✅       | Consumer secret for the project                                        |
| `YAHOO_REFRESH_TOKEN` | ✅       | Long-lived refresh token obtained during manual OAuth consent          |
| `YAHOO_ACCESS_TOKEN`  | ➖       | Optional cached token; refreshed automatically when omitted or expired |
| `YAHOO_GAME_KEY`      | ➖       | Overrides the game prefix for numeric league ids (defaults to `nhl`)   |

Place them in `.env.local` (for dev) or the hosting environment. Additional optional helpers such as
`YAHOO_GAME_KEY` and `YAHOO_LEAGUE_ID` live in `src/env.js` for down-stream consumers.

## Quick start

```ts
import { yahooEndpoints } from "@gshl-yahoo";

async function loadLeague() {
  const { payload } = await yahooEndpoints.league();
  return payload.league; // Typed as YahooLeague
}
```

In Apps Script, `updatePlayerDays` coordinates the nightly roster sync:

```
1. Read Season/Week/Team metadata from Google Sheets.
2. For each active franchise, call yahooTableScraper(targetDate, yahooTeamId, seasonId).
3. Normalize the roster payload, merge Player sheet metadata, and compute ratings + lineups.
4. Upsert PlayerDayStatLine / TeamDayStatLine tables via upsertSheetByKeys.
```

`yahooTableScraper` mirrors the behavior of `yahooEndpoints.teamRoster` by hitting the same Yahoo
resources, parsing the HTML table response, and returning unified player objects the optimizer can
consume.

All endpoint helpers perform three things for you:

1. Resolve or refresh an OAuth access token using the environment configuration.
2. Fetch the XML resource and convert it into the normalized JSON contracts in
   `src/lib/types/yahooSports.ts`.
3. Return a typed response that includes relevant metadata and (optionally) the raw XML.

### League key defaults

If you set `YAHOO_LEAGUE_ID` in your environment, the league-centric helpers (such as
`yahooEndpoints.league`, `leagueStandings`, `leagueScoreboard`, `leaguePlayers`, and
`leagueTransactions`) will use it automatically when you omit the `leagueKey` argument. Provide a
full league key (for example, `nhl.l.6989`) or a numeric league id. Numeric ids automatically use
the `YAHOO_GAME_KEY` prefix when present, falling back to `nhl` when unset.

Override the default at any time by passing a `leagueKey` explicitly:

```ts
await yahooEndpoints.league("nhl.l.12345");
```

## Token management

`resolveYahooAccessToken` exposes the token resolution pipeline used by every request. You can call
it directly when you need the bearer token without triggering an HTTP request:

```ts
import { resolveYahooAccessToken } from "@gshl-yahoo";

const { accessToken, expiresIn } = await resolveYahooAccessToken();
```

Pass `accessToken` (to force a specific token) or `forceRefresh: true` when you want to bypass a
cached token. Failed resolutions throw a `YahooAuthError` with a descriptive message.

## XML parsing helpers

`parseYahooFantasyXml` converts the raw XML payload into the normalized JSON structure expected by our
types. You rarely need to call it directly—`yahooFetch` handles it automatically—but standalone usage
is available when processing XML fixtures or writing tests.

```ts
import { parseYahooFantasyXml } from "@gshl-yahoo";

const { meta, payload } = parseYahooFantasyXml(xmlString);
```

A `YahooXmlParseError` is thrown when the payload cannot be parsed or the structure is missing the
`<fantasy_content>` root node.

## Low-level fetch API

`yahooFetch` is the primitive all endpoint helpers share. It accepts a relative resource path and
supports several options:

```ts
import { yahooFetch } from "@gshl-yahoo";

const { payload, rawXml, headers, status, token } = await yahooFetch(
  `league/${leagueKey}/scoreboard`,
  {
    query: { week: 3 },
    includeRawXml: true,
  },
);
```

Key options:

- `query`: Appends `?key=value` pairs to the request URL.
- `body`: Sends a request body for endpoints that support writes.
- `headers`: Adds custom headers (the Authorization header is managed automatically).
- `includeRawXml`: Echoes the raw XML string back alongside the parsed payload.
- Token overrides: Any `ResolveYahooAccessTokenOptions` such as `forceRefresh` or `accessToken`.

When Yahoo responds with a non-2xx status, `yahooFetch` raises a `YahooApiError` containing the
status code, status text, request URL, and response body for debugging.

## Endpoint map

Prefer the high-level `yahooEndpoints` helpers for common resources—they handle qualifier suffixes
and types for you. All helpers return a `Promise<YahooFetchResult<...>>` with the appropriate payload
shape.

| Helper                                                       | Usage                                                            |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| `yahooEndpoints.game(gameKey)`                               | Single game record (`YahooGame`).                                |
| `yahooEndpoints.games(qualifiers?)`                          | Collection of games with optional qualifiers (e.g. `game_keys`). |
| `yahooEndpoints.league(leagueKey?)`                          | League metadata (`YahooLeague`).                                 |
| `yahooEndpoints.leagueStandings(leagueKey?)`                 | League standings tree with teams present.                        |
| `yahooEndpoints.leagueScoreboard(leagueKey?, qualifiers?)`   | Scoreboard view with matchups for a week.                        |
| `yahooEndpoints.team(teamKey)`                               | Team metadata (`YahooTeam`).                                     |
| `yahooEndpoints.teamRoster(teamKey, qualifiers?)`            | Team roster for a scoring period.                                |
| `yahooEndpoints.teamMatchups(teamKey, qualifiers?)`          | Team matchup history.                                            |
| `yahooEndpoints.leaguePlayers(leagueKey?, qualifiers?)`      | Players collection with stats/ownership detail.                  |
| `yahooEndpoints.leagueTransactions(leagueKey?, qualifiers?)` | Transaction feed.                                                |
| `yahooEndpoints.users(qualifiers?)`                          | User profile payloads.                                           |
| `yahooEndpoints.userGames(qualifiers?)`                      | User games collections, grouped under each user.                 |

Qualifiers accept objects whose values become semicolon-delimited filters (e.g.
`{ team_key: "123.l.456.t.7" }` → `;team_key=123.l.456.t.7`).

## Error handling checklist

| Error                | When it occurs                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `YahooAuthError`     | Environment credentials are missing or the refresh flow fails.                              |
| `YahooApiError`      | Yahoo returns a non-success HTTP status. Inspect `.status`, `.statusText`, `.url`, `.body`. |
| `YahooConfigError`   | `YAHOO_LEAGUE_ID` is missing when a league key is required.                                 |
| `YahooXmlParseError` | XML payload cannot be parsed or is missing required structure.                              |

Wrap calls in try/catch to surface issues with meaningful logging.

## Testing

Parser behavior is covered by a Node test in `xml.spec.ts`. Run it with Node's built-in test runner
when making parser changes:

```
npx node --test src/lib/yahoo/xml.spec.ts
```

## Troubleshooting

- **401 Unauthorized**: Confirm the refresh token is valid and client credentials match the Yahoo
  app that issued it. Delete `YAHOO_ACCESS_TOKEN` to force a refresh.
- **Unexpected payload shape**: Use `includeRawXml: true` and log the XML to compare against
  `src/lib/types/yahooSports.ts` contracts.
- **Stale data**: Yahoo caches aggressively. Pass qualifiers such as `{ week: currentWeek }` to target
  the desired scoring period.
