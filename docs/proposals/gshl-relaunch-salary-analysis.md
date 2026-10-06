# GSHL relaunch salary analysis

[Project overview](../../README.md) · [Owner proposal](gshl-relaunch-owner-proposal.md)

> Updated September 28, 2026 for the agreed relaunch rules. This is a local
> rank-based planning model, not a live roster or contract simulation. It does
> not change production salaries, contracts, or the salary cap.

## What the revised rules imply

**October 2 curve revision:** ranks 1–3 now receive $10M. The declining PCHIP
segment starts at rank 3 and retains the rank 20/160/325/400 benchmarks.
Rank 4 receives $9.95M. With $50k rounding, the top 210 total $1,481.55M,
averaging $105.825M across 14 teams; snake-distributed payrolls range from
$105.65M to $106.05M. The executable source is
`scripts/src/runtime/relaunch-salary-curve.ts`. The calculations, comparisons,
and coefficients below document the preceding rank-1 curve and are historical;
they have not been recalculated for this top-three revision.

The goal is a retained core approaching **15 players per team**, leaving roughly
eight roster openings before UFA and the draft. There is no numeric keeper
maximum. **The proposed salary cap is $100 million per team**. The cap and
updated curve must be tested together before rollout against that goal.

The top **210 players** cost **$1483.95M** in total under the proposed
curve. Across 14 teams, that averages **$106.00M per 15-player team** at
base prices, **$116.60M** at renewal prices, or **$121.50M** under the
illustrative contract mix below.

This meets the requested **$104M–$108M average at base prices**, using 15 players
per team. The previous proposal averaged **$97.43M**; the lift adds
**$8.56M per team**, or **8.79%**. This target is a payroll
benchmark, not an adopted salary cap.

The $100M cap is **$6.00M below the base-salary average** for this pool.
Owners will need to make retention choices. Real keeper groups can include cheaper
players outside the top 210 and older fixed-price contracts. Some top players
will be drafted and cap-free rather than under contract. It does show that
the top-210 benchmark cannot be retained in full at fresh base prices under this cap.

## The 2027–2028 transition

The 2027 draft redistributes the protected returning talent. The new salary
curve takes effect for **2028 re-signings**. At the **end of that re-signing
period**, teams must stay within a **firm $40M cap**, with **no contract-count
limit** beyond roster capacity. Existing contracts and new re-signings count together. Normal
cap accounting includes buyouts and outgoing retained salary. This checkpoint
applies only to the 2028 transition.

When UFA opens, the cap becomes **$100M**, still without a contract-count limit.
The remaining contracts are filled through UFA, targeting roughly 15 in total.

The 2028 offseason has a one-time UFA range of **100%–150% of base salary**,
in five-percentage-point steps. A $4M player can receive $4M–$6M per year.
The salary score is `(offer / base salary - 1) / 0.50`, retaining the normal
weights, term rules, draw method, and reservations for every covered season.

At a full $40M cap charge at the re-signing checkpoint, a team has **$60M left
for UFA**. The number of additions needed depends on how many contracts fit
under the re-signing cap. For a team below 15 contracts, the average available
per addition to reach 15 is `remaining cap room / (15 - signed contracts)`.
Spending less at the checkpoint leaves more UFA room. Pending offers reserve
that room, and any additional cap obligations reduce it. Existing contracts
keep their signed salaries. Fifteen remains a target, not a contract limit.

For comparison, signing the entire top-210 benchmark through the special UFA
market would average **$106.00M per team at the minimum** and **$158.99M at the
maximum**. These are sensitivity cases, not forecasts: actual teams combine
carried contracts, re-signings, and market additions. The cheaper entry point
helps build a larger core but does not guarantee 15 contracts under $100M.

After 2028, UFA returns to the normal **110%–148.5% of base salary** range used
in the ordinary calculations below. The base-salary curve and rank-pool payrolls
are unchanged.

## Financial rules used in this analysis

| Situation                                                   | Salary or cap treatment                                                                                              |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Initial drafted season, including a redrafted mandatory UFA | Cap-free                                                                                                             |
| First contract                                              | 100% of base salary                                                                                                  |
| Incumbent second contract                                   | 110% of updated base salary                                                                                          |
| UFA minimum                                                 | 110% of base salary                                                                                                  |
| UFA maximum                                                 | 135% of the UFA minimum: **148.5% of base salary**                                                                   |
| Contract term                                               | One to three years; salary fixed throughout                                                                          |
| Contracted reserves                                         | Count against the cap normally                                                                                       |
| Pending UFA offers                                          | Reserve the full salary in every covered season and roster capacity                                                  |
| Salary retention                                            | 10%–50% for the remaining term, in 10% increments; two outgoing obligations per team, one retention per contract     |
| Buyout                                                      | 50% of the dropping team’s salary share through the later of original expiry or the end of the following GSHL season |

Existing signed salaries are preserved. The new curve prices new contracts;
it does not reprice all current commitments. Final cap rules, the curve,
salaries, and eligibility must be published at least 30 days before the contract
deadline and frozen for that offseason.

## A deeper base-salary curve

| Salary-model rank | Annual base salary |
| ----------------: | -----------------: |
|                 1 |        $10 million |
|                20 |      $9.25 million |
|               160 |      $5.75 million |
|               325 |       $2.5 million |
|               400 |         $1 million |

Use a shape-preserving cubic curve (PCHIP) through all five revised anchors.
It stays declining and has continuous first derivatives at interior joins.
Round each base salary to the nearest $50,000. Ranks 400 and later stay at the
$1M floor, where the slope changes.
[Method reference](https://docs.scipy.org/doc/scipy/reference/generated/scipy.interpolate.PchipInterpolator.html).

### Current and proposed salaries at the same rank

| Rank | Current base salary | Previous proposal | Lifted proposal | Lift over previous |
| ---: | ------------------: | ----------------: | --------------: | -----------------: |
|    1 |             $10.00M |           $10.00M |         $10.00M |             $0.00M |
|   20 |              $9.05M |            $9.00M |          $9.25M |            +$0.25M |
|   25 |              $8.70M |            $8.80M |          $9.10M |            +$0.30M |
|   50 |              $7.60M |            $7.90M |          $8.35M |            +$0.45M |
|   75 |              $7.00M |            $7.10M |          $7.70M |            +$0.60M |
|  100 |              $6.35M |            $6.40M |          $7.10M |            +$0.70M |
|  115 |              $6.00M |            $6.05M |          $6.75M |            +$0.70M |
|  150 |              $5.10M |            $5.20M |          $5.95M |            +$0.75M |
|  160 |              $4.80M |            $5.00M |          $5.75M |            +$0.75M |
|  168 |              $4.50M |            $4.85M |          $5.60M |            +$0.75M |
|  200 |              $3.40M |            $4.25M |          $4.90M |            +$0.65M |
|  250 |              $1.80M |            $3.50M |          $3.95M |            +$0.45M |
|  275 |              $1.20M |            $3.10M |          $3.45M |            +$0.35M |
|  300 |              $1.00M |            $2.60M |          $3.00M |            +$0.40M |
|  325 |              $1.00M |            $2.00M |          $2.50M |            +$0.50M |
|  350 |              $1.00M |            $1.00M |          $2.00M |            +$1.00M |
|  375 |              $1.00M |            $1.00M |          $1.50M |            +$0.50M |
|  400 |              $1.00M |            $1.00M |          $1.00M |             $0.00M |

Current values use the checked-in curve in
[player-rating-backfill.ts](../../scripts/src/domains/ranking/player-rating-backfill.ts),
with the same per-player rounding. This compares salary schedules, not signed
contracts or NHL salaries. The previous proposal is the curve through $9M at
rank 20, $5M at rank 160, and $2M at rank 325, reaching the $1M floor at 350.
The revised curve reaches $2.5M at rank 325, $2M at 350, $1.5M at 375, and
the $1M floor at 400, compared with rank 285 in the current schedule.
The final $2.5M-to-$1M decline now spans 75 ranks. Refitting the smooth curve
with this later endpoint slightly changes prices between ranks 160 and 325;
the 15-player average moves from $106.19M to $106.00M, still within target.
Every rank was checked against the previous proposal: none decreases
before or after rounding. The $10M ceiling and $1M floor remain unchanged.

## What teams would pay

For each scenario, select the top `14 × player count` ranks. Distribute ranks
1–14 to teams 1–14, ranks 15–28 to teams 14–1, and repeat this snake pattern.
There are no positional constraints or rating ties in this benchmark.

| Players per team |    Pool | Base payroll range | Average base | Average at 110% | Average at maximum UFA, 148.5% |
| ---------------: | ------: | -----------------: | -----------: | --------------: | -----------------------------: |
|               10 | Top 140 |    $78.80M–$79.00M |      $78.88M |         $86.77M |                       $117.13M |
|               11 | Top 154 |    $84.70M–$85.15M |      $84.90M |         $93.39M |                       $126.08M |
|               12 | Top 168 |    $90.55M–$90.75M |      $90.62M |         $99.68M |                       $134.57M |
|               14 | Top 196 |  $101.05M–$101.30M |     $101.16M |        $111.27M |                       $150.22M |
|               15 | Top 210 |  $105.80M–$106.25M |     $106.00M |        $116.60M |                       $157.40M |

The 12-player pool fits under $100M at base prices; the 14-player pool does not.
This is limited to these top-ranked pools, not a prediction of every team’s
keeper count. All-renewal and all-maximum-UFA columns are sensitivity cases.

### All 14 teams: 12-player comparison and 15-player target

| Team | 12-player base | 15-player base | 15 players at 110% | 15-player rank sum |
| ---: | -------------: | -------------: | -----------------: | -----------------: |
|    1 |        $90.75M |       $106.25M |           $116.88M |               1576 |
|    2 |        $90.75M |       $106.25M |           $116.88M |               1577 |
|    3 |        $90.65M |       $106.15M |           $116.77M |               1578 |
|    4 |        $90.65M |       $106.10M |           $116.71M |               1579 |
|    5 |        $90.70M |       $106.10M |           $116.71M |               1580 |
|    6 |        $90.55M |       $105.95M |           $116.55M |               1581 |
|    7 |        $90.65M |       $106.00M |           $116.60M |               1582 |
|    8 |        $90.60M |       $106.00M |           $116.60M |               1583 |
|    9 |        $90.55M |       $105.90M |           $116.49M |               1584 |
|   10 |        $90.55M |       $105.85M |           $116.44M |               1585 |
|   11 |        $90.55M |       $105.85M |           $116.44M |               1586 |
|   12 |        $90.65M |       $105.90M |           $116.49M |               1587 |
|   13 |        $90.55M |       $105.85M |           $116.44M |               1588 |
|   14 |        $90.55M |       $105.80M |           $116.38M |               1589 |

The 15-player payroll spread is **$0.45M**, about
**0.42%** of the mean. Twelve rounds give every team rank sum 1,014.
Fifteen rounds leave an unpaired round: rank sums range from 1,576 to 1,589,
averaging 1,582.5. The 15-player allocation is only approximately balanced by
rank. Neither exercise proves equal underlying talent. Reallocating a fixed
pool changes the team spread, but not the league total or mean.

Figures are displayed to $0.01M; calculations use full-dollar base salaries
rounded per player before applying contract premiums.

## Contract mix and the proposed $100M cap

An illustrative mix puts half of base payroll at first-contract prices, one
quarter at the renewal/UFA minimum, and one quarter at the UFA maximum:

`0.50 × 1.00 + 0.25 × 1.10 + 0.25 × 1.485 = 1.14625`

These are shares of **base payroll**, not player counts. This is an example,
not a forecast, and excludes buyouts and other cap obligations.

| Players per team | Average under this mix | Amount above $100M |
| ---------------: | ---------------------: | -----------------: |
|               12 |               $103.87M |             $3.87M |
|               14 |               $115.95M |            $15.95M |
|               15 |               $121.50M |            $21.50M |

For the 15-player benchmark, alternative caps leave the following room before
buyouts, outgoing retention, and additional reserved offers. Negative values
mean the modeled payroll already exceeds the cap.

| Cap being tested | Room at base prices | Room at 110% | Room under illustrative mix |
| ---------------: | ------------------: | -----------: | --------------------------: |
|            $100M |             -$6.00M |     -$16.60M |                    -$21.50M |
|            $110M |              $4.00M |      -$6.60M |                    -$11.50M |
|            $115M |              $9.00M |      -$1.60M |                     -$6.50M |
|            $120M |             $14.00M |       $3.40M |                     -$1.50M |
|            $125M |             $19.00M |       $8.40M |                      $3.50M |
|            $130M |             $24.00M |      $13.40M |                      $8.50M |

$100M is the selected proposal; the other rows are sensitivity comparisons.
At that cap, the modeled 15-player group is about $6M over at base prices,
$16.60M over at renewal prices, and $21.50M over under the illustrative mix.
Real keeper groups will need cheaper depth, existing lower-cost commitments,
or fewer signed players. Test actual franchise choices rather than forcing
every team to retain 15 players.

## UFA bid levels and their effect on cost

Offers run from 100% to 135% of the UFA minimum in 5% steps. The minimum is
110% of base salary. For a player with a $4M base salary:

| Offer as % of UFA minimum | Offer as % of base | Annual salary | Normalized salary score |
| ------------------------: | -----------------: | ------------: | ----------------------: |
|                      100% |             110.0% |        $4.40M |                   0.000 |
|                      105% |             115.5% |        $4.62M |                   0.143 |
|                      110% |             121.0% |        $4.84M |                   0.286 |
|                      115% |             126.5% |        $5.06M |                   0.429 |
|                      120% |             132.0% |        $5.28M |                   0.571 |
|                      125% |             137.5% |        $5.50M |                   0.714 |
|                      130% |             143.0% |        $5.72M |                   0.857 |
|                      135% |             148.5% |        $5.94M |                   1.000 |

Base salaries are rounded first, then the agreed bid multipliers apply. The
table does not introduce a second $50,000 rounding step that would alter bids.
Three years at $5.94M reserves $5.94M in **each** covered season, not $5.94M
divided across the term.

The UFA score is 45% salary, 25% term, 20% roster fit, 5% previous performance,
3% Owner Ladder, and 2% draft capital. Salary is normalized as
`(offer / UFA minimum - 1) / 0.35`; terms of one, two, and three years score
0, 0.5, and 1. The draw allocates 10% equally and 90% by `exp(3 × score)`.
A sole valid bidder wins automatically.

Odds affect who signs the player, not the winning offer’s salary. A spending
forecast needs actual offers and team factors, which this analysis does not
supply. Every live offer reserves its full commitment even if its odds are low.

## Retention, buyouts, and contract turnover

Retention divides a cap charge between teams without removing league-wide
salary. On a $5M contract with 40% retained, the seller owes $2M and the buyer
$3M. If the buyer drops the player, the seller still owes $2M through original
expiry; the buyer owes a $1.5M buyout for the normal duration. The seller’s
retention slot frees at original expiry.

A retaining franchise cannot reacquire during its obligation. A dropping
franchise cannot reacquire a bought-out player until original contract expiry.
The buyout resets the contract cycle but preserves roster-day eligibility. A
new owner can acquire the player without a contract, then sign a first contract
in the offseason if eligible. The original cap obligations remain.

After two contracts, mandatory UFA provides an open-market opportunity. A UFA
signing starts a new cycle. A player unsigned at the offseason UFA close enters
the draft and receives the normal cap-free drafted season. These routes and
fixed existing salaries mean a future keeper group will not necessarily cost
as much as 15 fresh contracts from the top 210. Multi-season modeling is needed.

## Talent balance and the remaining calibration

The current salary ordering uses this market score:

`overallRating + 0.08 * (seasonRating ?? overallRating) + ageAdjustment`

Equal rank sums do not guarantee equal sums of that score. Current salary code
also groups adjacent equal overallRating values for average-rank pricing after
ordering by market score. Resolve that tie-handling detail before the final
player-based calibration; this calculation assumes unique ranks.

The remaining work is to:

1. Use a dated rating and contract snapshot, including positions and eligibility.
   Balance the top 210 into plausible 15-player groups using the same market
   score that orders salaries. Report both rating and salary spreads.
2. Model real keeper choices, cheaper depth, prospects, cap-free drafted
   seasons, contracted reserves, and fixed existing salaries.
3. Apply first-contract prices, renewals, UFA behavior, pending offers,
   retention, buyouts, and cycle resets over several seasons.
4. Test the selected $100M cap with the updated curve. Compare keeper counts,
   retained talent, and transaction room across contenders and rebuilding
   teams, targeting roughly 15 as an outcome rather than a hard quota.
5. Finalize and publish the cap, curve, salaries, and eligibility at least
   30 days before the contract deadline.

No live ratings, franchise rosters, or contracts were queried for this update.
This is a reproducible salary-schedule benchmark, not a claim that production
currently implements or supports the proposed economy.

## Reproducing and checking the calculation

For rank `r` within a segment, set `t = (r - start) / (end - start)`. Salary in
millions is `a*t^3 + b*t^2 + c*t + d` using these coefficients:

| Start | End |               a |               b |               c |               d |
| ----: | --: | --------------: | --------------: | --------------: | --------------: |
|     1 |  20 |  0.100383986774 | -0.067522351554 | -0.782861635220 | 10.000000000000 |
|    20 | 160 | -0.639283865519 |  1.683789808718 | -4.544505943199 |  9.250000000000 |
|   160 | 325 | -0.425353799770 |  0.822770636789 | -3.647416837019 |  5.750000000000 |
|   325 | 400 |  0.002926380568 | -0.012955033863 | -1.489971346705 |  2.500000000000 |

Coefficients are displayed to 12 decimals; calculations use full precision.
Convert to dollars, apply `Math.round(dollars / 50000) * 50000`, and keep ranks
400 and later at $1M. Apply contract multipliers afterward.

Checks cover anchors, monotonicity and bounds through rank 400, continuous
interior slopes, coefficient/Hermite evaluation agreement, unique allocation,
roster counts, rank sums for even and odd rounds, and payroll totals for all
five pool sizes. Contract multipliers and bid endpoints are checked separately.
Every integer rank through 350 is checked for a nondecreasing price versus the
previous proposal, and the 15-player average is checked against $104M–$108M.
These checks do not replace the outstanding real-franchise simulations.
