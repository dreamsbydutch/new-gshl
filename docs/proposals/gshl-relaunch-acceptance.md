# Relaunch calculations and acceptance examples

[Owner proposal](gshl-relaunch-owner-proposal.md)

This is the executable design companion to the proposal, prepared October 17, 2026. It settles the remaining numerical choices without changing the agreed
rosters, category weights, cap, deadlines, or contract terms. The tests exercise
an **offline reference model**, not deployed Convex transactions. Adoption and
production integration remain separate.

## Best-ball selection

Use the existing `RankingEngine` `PlayerDayStatLine` profile, with its F/D/G
cohorts, category blends, workload handling, and two-decimal rating output.
Use all completed NHL player-games inside the matchup's dates as the common
comparison pool, including games from unowned and reserve players. Only games
earned while eligible on a franchise's main roster can be selected. This
separates rating calibration from owner roster decisions. Supply the relaunch's
seven skater and three goalie categories, never historical extra categories.
Zero production with a recorded appearance is a real game; missing source data
is not a zero. Reject incomplete inputs before calculating official results.

Keep each player's real game ID, recorded game-lock ownership, and locked season
positions. A stable key is the NHL game ID followed by the canonical player ID,
compared in ascending binary string order. Never use database arrival order.
Freeze the engine source/configuration version for the season. As games arrive,
the common pool and provisional ratings can change; finalization freezes both.

The selection has two passes:

1. Repair illegal pins by preserving higher-rated pins first, then stable IDs.
   Construct each opponent's preliminary selection using ratings and stable
   IDs, without category tiebreaks. Include goalie pins, fill to three goalie
   appearances if possible, and do not add optional goalie games yet.
2. Compute each category's absolute gap between those preliminary totals,
   divided by its typical-game-impact unit. Sort from smallest to largest.
   Equal normalized gaps follow `G, A, P, PPP, SOG, HIT, BLK` for skaters and
   `W, GAA, SVP` for goalies. An undefined ratio sorts last. Use this same order
   for both opponents throughout the final calculation.
3. Select skaters by descending rating, then the fixed category order, then
   stable ID. Preserve legal pins. Assign positions using bipartite matching,
   allowing earlier multi-position games to move to another eligible position.
   Fill as many legal appearances as possible, then maximize their rating sum.
   This avoids a greedy position assignment blocking an otherwise legal game.
4. Fill the goalie baseline around its pins. For equal goalie ratings, compare
   the effect of adding each candidate's underlying totals to the same team's
   preliminary goalie reference. This is a comparison device, not an extra
   counted appearance. It avoids ranking isolated save percentages or GAA.
5. Evaluate subsets of remaining goalie games against the final pinned
   baseline. Both ratios must be no worse; a ratio or wins must improve.
   Compare qualifying complete totals in the fixed category order. Prefer fewer
   optional games on exact ties, then the sorted game-ID list. Never recalculate
   category order from the selected result.

When two identical skater-rating totals could be built differently, the ordered
candidate preference resolves the tie. The matching-based selection passed
250 generated cases against exhaustive subset enumeration. The research goalie
enumerator permits up to 20 optional appearances; production must use an exact
bounded search or equivalent optimization for larger inputs, not silently drop
candidates or switch to arrival-order selection.

GAA is `3600 × goals against / seconds`; save percentage is `saves / shots
against`. Use source saves, not `shots against - goals against`: source totals
can differ on special events. Do not average appearance percentages. A zero
denominator stays undefined, never a fabricated perfect ratio. An undefined
ratio cannot beat a defined one; if neither team has a defined ratio, exclude
that category. The existing three-appearance forfeiture rule takes precedence.
For comparisons use full totals, not rounded scoreboard values; the reference
model uses a `1e-12` tolerance for floating-point ratio equality.

## Historical impact calibration

The reference season is **2024–25 NHL regular season**: 1,312 games, 920 skaters,
47,224 skater appearances, and 2,764 goalie appearances, including relief work.
These are league-wide NHL units, not a claim that historical GSHL rosters have
been replayed under best-ball. Their purpose is to make different category gaps
comparable **only when game ratings tie**.

For skater counting categories and wins, use total production divided by total
appearances. For goalie ratios, build a reference of three mean goalie
appearances. For every historical appearance, add its underlying totals to that
reference and measure the absolute ratio change. The mean absolute change is
the impact unit. This remains positive even when a category has many zero games.

```text
G       0.1672454684     A       0.2814458750
P       0.4486913434     PPP     0.0950364222
SOG     1.5707902761     HIT     1.1920421819
BLK     0.8470481111     W       0.4746743849
GAA     0.3349885531     SVP     0.0119429063
```

Use the [full-precision calibration artifact](gshl-relaunch-calibration.json),
not the rounded display above. The three-game
reference has GAA 2.8131119243 and save percentage 0.9001384515. Publish and freeze
the calibration artifact for the season. These constants are a defined starting
calibration; a later preseason replacement requires a versioned replay, not an
unannounced midseason adjustment.

For example, a one-goal gap is about 5.98 typical impacts, while a one-assist gap
is about 3.55. Assists therefore break an equal-rating tie first. A game rated
50.01 still outranks one rated 50.00 regardless of that order.

The older local season snapshot was rejected as the calibration source: it has
47,301 appearances and 457 blank PPP entries. Official season summaries reconcile
to all 47,224 cached skater appearances for goals, assists, points, and shots.
PPP comes from the official game summaries; hits and blocks come from the
official season realtime report. No blank field was silently converted to zero.

The source is the NHL's [season summary](https://api.nhle.com/stats/rest/en/skater/summary?isAggregate=false&isGame=false&start=0&limit=-1&cayenneExp=seasonId%3D20242025%20and%20gameTypeId%3D2)
and [realtime report](https://api.nhle.com/stats/rest/en/skater/realtime?isAggregate=false&isGame=false&start=0&limit=-1&cayenneExp=seasonId%3D20242025%20and%20gameTypeId%3D2),
plus previously cached official game-summary batches. Season reports were read
on October 17, 2026. The calculation verifies every cached page's SHA-256,
deduplicates player-game IDs, and checks complete game coverage.

```text
Season summary SHA-256
243aa1b0df2892d90f139157ae18e627e177b04f76047294e72ef23b49baa2ea
Season realtime SHA-256
cc1374fdf50f94a52540d1c0f716208e7f871d5caed72025bb1255c50e400d8e
Ordered cached-page hashes, combined SHA-256
137b196f7a16a1b6e4b4b120ea828d39a67a6578f198c4761bdb8df33e28b7e8
```

## Claim and UFA normalization

Use the published one-year overall player rating, converted to a pooled
percentile across the rated, eligible player pool. Do not use the negotiated
salary or the prospective contract's length to value the roster. For a value in
a population of `N > 1`, its percentile is
`(number below + (number equal - 1) / 2) / (N - 1)`. Ties share a midrank;
a singleton scores 0.5. Unrated players score zero until a rating is published;
they remain eligible to acquire and play. Vacant slots also score zero.

Freeze this player-value map at offseason opening for UFA, and at the start of
the management period for in-season claims, using only information already
available. Do not recalibrate a multi-week matchup each Monday. Store the map's
version with the closing snapshot. The player-specific UFA blend uses the same
midrank formula within F, D, or G for its positional percentile `p`.

Let `V(roster)` be the greatest sum of player percentiles that can fit in
`3 C / 3 LW / 3 RW / 4 D / 2 G`, choosing from **all owned players**. Each player
occupies one slot. Missing slots contribute zero. Then:

```text
quality     = V(current roster) / 15
weakness    = 1 - quality
improvement = max(0, V(roster after target and proposed drop) - V(current roster))
opportunity = improvement
claim score = 0.75 × opportunity + 0.25 × weakness
```

Adding one player worth at most one cannot improve `V` by more than one, even
with positional rearrangement. This gives improvement a natural zero-to-one
scale without making a negligible gain worth 100% merely because it beats the
other bidders. The denominator for quality always stays 15, including vacancies.
The target does not improve its own teammate-quality score.

Apply the proposal's UFA blend and 45/25/20/5/3/2 weights unchanged. Salary uses
rounded $50,000 endpoints, term uses `(years - 1) / 2`. For the remaining factors:

- Previous performance uses the most recently completed GSHL season: 70%
  regular-season win fraction, counting ties as half, plus 30% playoff progress.
  Progress is 0.2 for no Cup berth, 0.4 for QF, 0.6 for SF, 0.8 for finalist,
  and 1 for champion. Normalize across all 14 franchises using midranks.
- Owner Ladder uses the official published Ladder snapshot, normalized across
  the 14 current owners. Do not reconstruct a different Ladder inside UFA.
- Draft capital uses remaining usable picks in the upcoming draft at closing,
  with value `max(1, 24 - round) / 23` per pick. Include acquired picks and
  temporarily skipped picks; exclude used, keeper-consumed, and not-yet-created
  fill picks. Normalize across all 14 franchises. This uses the actual 23-round
  draft rather than the current implementation's older 15-round assumption.
- A missing historical performance or Ladder observation is neutral 0.5,
  explicitly recorded as missing. Zero remaining draft picks is a real zero
  before percentile normalization. All equal raw values normalize to 0.5.

Closing-time ownership determines fit. Pending offers do not become owned
players for scoring. Resource validation separately assumes their full binding
cost. All draws closing together read the same pre-processing snapshot.

Keep `P(i) = 0.10 / n + 0.90 × exp(3s_i) / sum(exp(3s_j))`. Sort offers by stable
offer ID before drawing. Use one server-generated uniform variate in `[0,1)`;
choose the first cumulative probability strictly greater than it. Persist that
variate, exact probabilities, input snapshot, formula version, and award together.
Retries reuse the award, never roll again. The seeded simulation generator is
for tests only, not production randomness.

### Worked odds

A target valued at 0.90 replaces a 0.30 center on a rebuilding roster or a 0.80
center on a strong roster. Each example roster has 15 players at its stated
value. All other UFA factors are 0.5; target positional percentile is 0.9.

- **Claims:** opportunity is 0.60 versus 0.10; weakness is 0.70 versus 0.20.
  Claim scores are 0.625 versus 0.125. Odds are **78.58% rebuilding / 21.42% strong**.
- **Equal salary and term in UFA:** fit is 0.414 versus 0.534. Odds are
  **48.38% rebuilding / 51.62% strong**. Strong teammates provide a modest
  advantage to an elite player; they do not overwhelm opportunity.
- **Rebuilder offers $5.95M for three years; strong team offers $4.4M for one:**
  odds become **84.53% rebuilding / 15.47% strong** for a $4M base player.
- **Identical nonfinancial factors:** maximum salary/term versus minimum gives
  **85.18% / 14.82%**. In 200,000 seeded draws, the stronger offer won **85.227%**.
- **Fourteen bidders:** one score of 1 against thirteen scores of 0 wins
  **55.35%**. Competition still matters. Fourteen equal scores each receive 1/14.

These are intended model behaviors, not fitted estimates of real player choices.

## Binding commitments and timing

The first offer reserves its full resources. Accept subsequent actions only if
all earlier commitments winning is legal **and** no mixture of losses makes the
later commitments illegal. Never discount a reservation by its odds. An offer
increase checks the whole revised ledger. Conditional drops must be distinct,
already owned, and unavailable to other trades or claims while reserved.

Example in millions: a team has $80M of other salary and a $10M player. Offer A
replaces that player with a $1M signing and a $5M buyout. Offer B adds $13M.
Both wins total $99M, but A losing and B winning total $103M. Reject B. The team
cannot spend savings from a buyout that has not happened. Check each covered
season, existing retained shares, and buyout extensions through at least the
following season. The offline outcome enumerator checks net owner salary inputs;
the production adapter must supply existing retained/dead-cap obligations too.

The reference queue exercises these agreed outcomes:

- A Sunday award involving a locked player stays queued and consumes Monday's
  new allowance when it executes. The previous week's two used acquisitions
  remain unchanged. Its earlier earned performances remain historical inputs.
- Elimination blocks new submissions but leaves a valid existing claim alive.
- A delay into a full processing week waits for capacity, preserving the
  commitment. Reprocessing an executed queue entry has no second effect.
- At season end: finalize, expire contracts, execute eligible transactions,
  freeze the resulting main roster, then cancel leftovers. Dropping the expired
  contract creates no buyout. A transaction due after closeout is cancelled and
  never enters the tournament lineup.

These tests use explicit logical queue instants and supplied allowance periods.
They do not exercise the deployed scheduler, Eastern-time conversion, new-claim
authorization, database races, or ingestion. Those require integration checks.

## Calendar and launch acceptance

The calendar policy was already clear. July 1 UFA, August 1 draft, four active
hours per pick, 10 a.m.–10 p.m. Eastern, seven-day markets, and the final fill-pick
cutoff do not need another owner decision. Assigning the actual season-opening
instant and fill-pick cutoff is ordinary calendar publication.

The existing eight-round estimate is correct: 112 full-clock picks need 38
active draft dates. The extreme 23-round, 322-pick case needs 108. This is a
capacity stress case, not a predicted duration or a new deadline rule. Before
launch, compare actual usable picks, expected restored picks, and available
active hours with the published cutoff. Report the shortfall rather than promise
that every possible draft fits. Late vacancies already have an agreed waiver route.

The standalone suite passes 13 tests, including 250 exhaustive positional
comparisons and 200,000 seeded draws. It checks a full synthetic 45-appearance
matchup, input-order independence, pins, goalie combinations, reserves, proposed
drops, future cap obligations, duplicate drops, roster maximums, and closeout.

Run from the repository root:

```powershell
node --test tools/tests/relaunch-acceptance.test.mjs
node tools/relaunch-calibration.mjs
```

The tests are self-contained. Historical recalculation also needs the local
cached sources named by the calibration script; it intentionally fails on
missing files or mismatched totals instead of downloading or substituting data.
Those caches are research inputs, not independent backups or committed fixtures.

Production launch acceptance must additionally demonstrate the following against
the integrated app:

1. A full historical matchup replay with actual locked positions, ownership at
   game lock, corrections, and finalization; inspect effects across F/D/G and
   longer matchups. This report calibrates units and tests synthetic selections;
   it does not establish historical win-rate or appearance-limit suitability.
2. Two concurrent offers/picks/trades competing for the same asset or capacity:
   one commits, the other rejects atomically. Losing an offer releases only its
   reservations. All simultaneous draws preserve their common odds snapshot.
3. Actual Monday 5 a.m./noon handling across Eastern daylight-saving changes,
   prolonged matchups, re-locking before noon, and acquisition/reserve budgets.
4. Season-end closeout with real cap rollover, retained salaries, tournament
   roster persistence, and restart after a partial worker failure.
5. Current-pick trades preserving remaining clock, restored picks before fill
   picks, the exact opening-offer cutoff, and late losses after the fill cutoff.

No production settings, contracts, salaries, or deployed behavior changed in
this work. The existing UFA implementation still uses the old scoring and
probability rules; the new reference model is the acceptance target for its
eventual replacement.
