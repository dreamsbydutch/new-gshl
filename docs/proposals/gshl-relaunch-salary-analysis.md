# GSHL relaunch salary analysis

[Project overview](../../README.md) · [Owner proposal](gshl-relaunch-owner-proposal.md)

> Recalculated October 16, 2026 from the current rank-3 curve. Every new base,
> renewal, and UFA salary is rounded individually to the nearest $50,000.
> This local rank-based benchmark does not change production salaries or contracts.

## What the revised rules imply

The current [salary runtime](../../scripts/src/runtime/relaunch-salary-curve.ts)
pays ranks 1–3 $10M, then follows the smooth curve to the $1M floor at rank 400.
The top **210 players** cost **$1481.55M**, averaging
**$105.83M per 15-player team** across 14 teams. The exact average is
$105.825M; team payrolls range from **$105.65M to $106.05M**.

After rounding each player's contract price, the same pool averages
**$116.45M** at renewal prices and **$157.16M** at normal maximum
UFA prices. The illustrative blended scenario below averages **$121.32M**.

The $100M cap is **$5.83M below the base average**. This is intentional:
owners should find cheaper depth and make retention choices, not automatically
afford the strongest possible 15-player core. Roughly 15 is a target, not a quota.
The earlier proposal averaged $97.43M, so the current curve lifts this benchmark
by **$8.39M**, or **8.61%**, within the requested $104M–$108M range.

These are ranked salary pools, not actual balanced franchise rosters. Existing
fixed-price contracts and cap-free drafted players can change real payrolls.

## The 2027–2028 transition

The offseason after the season ending in **2027** uses the **current salary
curve and a $32.5M cap throughout re-signing, UFA, and the Super Draft**. The new
UFA bidding and weighted-selection system launches that summer, with normal
110%–148.5% pricing. The protected returning talent remains in the draft.

The new salary curve takes effect for **2028 re-signings**. At the **end of that
re-signing period**, teams must stay within a **firm $60M cap**, with **no contract-count
limit** beyond roster capacity. Existing contracts and new re-signings count together. Normal
cap accounting includes buyouts and outgoing retained salary. This checkpoint
applies only to the 2028 transition.

When UFA opens, the cap becomes **$100M**, still without a contract-count limit.
The remaining contracts are filled through UFA, targeting roughly 15 in total.

The 2028 offseason has a one-time UFA range of **100%–150% of base salary**,
in five-percentage-point steps. A $4M player can receive $4M–$6M per year.
The salary score uses the rounded offer and rounded 100%/150% endpoints, retaining the normal
weights, term rules, draw method, and reservations for every covered season.

At a full $60M cap charge at the re-signing checkpoint, a team has **$40M left
for UFA**. The number of additions needed depends on how many contracts fit
under the re-signing cap. For a team below 15 contracts, the average available
per addition to reach 15 is `remaining cap room / (15 - signed contracts)`.
Spending less at the checkpoint leaves more UFA room. Pending offers reserve
that room, and any additional cap obligations reduce it. Existing contracts
keep their signed salaries. Fifteen remains a target, not a contract limit.

Salaries are published when the **GSHL season ends**, without an advance
preview, and remain fixed for the offseason. Re-signing contracts are processed
and become binding immediately. Re-signing runs during the NHL playoffs and
closes **June 30**. Unsigned signing rights can exceed 23 without consuming
roster slots. Signed players, drafted players, and pending UFA commitments
cannot exceed 23 in total after distinct reserved conditional drops, and must
leave room for a legal positional roster.

All unsigned signing rights lapse June 30. On July 1, team rosters contain
only contracted players; every unsigned player enters the shared UFA/draft
pool regardless of roster-day re-signing eligibility, except the protected
2027 draft-only class. Later draft selections join rosters as cap-free players.
The roster-day threshold continues to govern incumbent re-signings only.
Offseason main/reserve moves are unlimited and do not change salary charges
or the separate frozen NHL playoff tournament lineup.

A UFA offer may name a conditional drop. The existing player remains owned if
the offer loses; a win executes the signing and drop together. Contracted drops
create normal buyouts, which must be included in the offer's cap checks in
every affected season. Concurrent offers cannot reserve the same drop.
Offseason buyout releases wait 48 hours before becoming available through UFA
or the draft. The final UFA opening-offer deadline and draft cutoff still
apply; otherwise the player waits for ordinary waivers to reopen.

Trading reopens when the NHL playoff tournament ends. Owners can make ordinary
rights trades and sign-and-trade deals before June 30; no special deferred
rights-trade queue is needed. Tournament scoring uses the frozen original
rosters.

**UFA runs July 1 until the next season starts; the slow draft starts August 1
and overlaps UFA.** There is no pre-draft UFA shutdown. Draft selections must
respect slots already reserved by live offers, and vice versa. Owners manage
the opportunity cost of binding offers; losing a draw frees cap room for
subsequent targets. Losing a late draw does not guarantee another signing
opportunity before the season begins. Shared player availability and the final
opening-offer cutoff must prevent conflicting awards and unfinished markets.
For a player eligible for both routes, the first valid action wins: an active
UFA offer removes draft availability, while a draft selection removes UFA
availability. Only the protected 2027 class remains draft-only. Availability
checks must be atomic for both routes.

If pending offers temporarily fill a team's roster capacity, its draft turn is
skipped without permanently forfeiting its roster-filling opportunity. Lost
offers restore room for remaining usable selections or end-of-draft fill picks.
Finish the current live pick, then restore skipped picks in their original
draft order with the normal pick clock. Outstanding selections and fill picks
use that same process after regular drafting, subject to a published cutoff
before the season.
If a lost UFA offer opens a roster slot after the final fill-pick cutoff, the
team carries a legal vacancy until ordinary waivers reopen; the draft does
not reopen.
Opening a UFA market to deny draft access is permitted, but a sole bidder must
honor the offered contract.

The calendar fixes the season-opening instant. New UFA markets stop opening
seven days beforehand and all markets finish by that instant. Ordinary noon
waivers then reopen for remaining unowned players.

For comparison, signing the entire top-210 benchmark through the special UFA
market would average **$105.83M per team at the minimum** and **$158.92M at the
maximum**. These are sensitivity cases, not forecasts: actual teams combine
carried contracts, re-signings, and market additions. The cheaper entry point
helps build a larger core but does not guarantee 15 contracts under $100M.

That scarcity is intentional. Owners are expected to find productive $1M,
$2M, and $2.5M players to make room for expensive stars. Calibration should
measure those choices rather than make the strongest possible 15-player roster
automatically affordable.

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
it does not reprice all current commitments. Individual salaries are published
when the GSHL season ends and frozen for that offseason. There is no required
30-day advance preview. Re-signings become binding immediately at the published
price and must be completed by June 30.

Contract years roll over when the GSHL finals become final. Expiring contracts
end then with the applicable RFA or UFA status. New contracts start when signed
and expire at the end of the GSHL finals in their final covered season. A
three-year contract signed after the 2028 finals covers seasons ending in
2029, 2030, and 2031. Each season has its own cap sheet: commitments charge
every covered season, and expiring contracts are not charged again alongside
their replacements. Retention and buyout obligations use those same season
boundaries and their existing duration rules.

At season end, contract rollover happens before pending transactions process.
A transaction dropping a contract that has just expired therefore creates no
buyout. Eligible transactions then execute, tournament rosters freeze, and any
remaining in-season transactions are canceled with reservations released.

## A deeper base-salary curve

| Salary-model rank | Annual base salary |
| ----------------: | -----------------: |
|               1–3 |        $10 million |
|                20 |      $9.25 million |
|               160 |      $5.75 million |
|               325 |       $2.5 million |
|     400 and later |         $1 million |

Use a shape-preserving cubic curve (PCHIP) through all five revised anchors.
It stays declining and has continuous first derivatives at interior joins.
Round each base salary to the nearest $50,000. Ranks 400 and later stay at the
$1M floor, where the slope changes.
[Method reference](https://docs.scipy.org/doc/scipy/reference/generated/scipy.interpolate.PchipInterpolator.html).

### Current and proposed salaries at the same rank

| Rank | Current base salary | Previous proposal | Lifted proposal | Lift over previous |
| ---: | ------------------: | ----------------: | --------------: | -----------------: |
|    1 |             $10.00M |           $10.00M |         $10.00M |             $0.00M |
|    2 |             $10.00M |            $9.95M |         $10.00M |            +$0.05M |
|    3 |             $10.00M |            $9.90M |         $10.00M |            +$0.10M |
|    4 |              $9.95M |            $9.85M |          $9.95M |            +$0.10M |
|   20 |              $9.05M |            $9.00M |          $9.25M |            +$0.25M |
|   25 |              $8.70M |            $8.80M |          $9.10M |            +$0.30M |
|   50 |              $7.60M |            $7.90M |          $8.30M |            +$0.40M |
|   75 |              $7.00M |            $7.10M |          $7.65M |            +$0.55M |
|  100 |              $6.35M |            $6.40M |          $7.05M |            +$0.65M |
|  115 |              $6.00M |            $6.05M |          $6.70M |            +$0.65M |
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
The final $2.5M-to-$1M decline spans 75 ranks. Ranks 1–3 are fixed at $10M;
rank 4 is $9.95M. Every integer rank through 400 was checked against the
earlier proposal: no rounded base salary decreases.

## What teams would pay

For each scenario, select the top `14 × player count` ranks. Distribute ranks
1–14 to teams 1–14, ranks 15–28 to teams 14–1, and repeat this snake pattern.
There are no positional constraints or rating ties in this benchmark.

| Players per team |    Pool | Base payroll range | Average base | Average at 110% | Average at maximum UFA, nominal 148.5% |
| ---------------: | ------: | -----------------: | -----------: | --------------: | -------------------------------------: |
|               10 | Top 140 |    $78.60M–$78.85M |      $78.71M |         $86.61M |                               $116.89M |
|               11 | Top 154 |    $84.50M–$84.95M |      $84.73M |         $93.23M |                               $125.84M |
|               12 | Top 168 |    $90.35M–$90.60M |      $90.45M |         $99.53M |                               $134.33M |
|               14 | Top 196 |  $100.90M–$101.15M |     $100.99M |        $111.12M |                               $149.96M |
|               15 | Top 210 |  $105.65M–$106.05M |     $105.83M |        $116.45M |                               $157.16M |

The 12-player pool fits under $100M at base prices; the 14-player pool does not.
This is limited to these top-ranked pools, not a prediction of every team’s
keeper count. All-renewal and all-maximum-UFA columns are sensitivity cases.

### All 14 teams: 12-player comparison and 15-player target

| Team | 12-player base | 15-player base | 15 players at 110% | 15-player rank sum |
| ---: | -------------: | -------------: | -----------------: | -----------------: |
|    1 |        $90.55M |       $106.05M |           $116.65M |               1576 |
|    2 |        $90.50M |       $106.00M |           $116.60M |               1577 |
|    3 |        $90.50M |       $106.00M |           $116.60M |               1578 |
|    4 |        $90.60M |       $106.05M |           $116.70M |               1579 |
|    5 |        $90.45M |       $105.85M |           $116.50M |               1580 |
|    6 |        $90.55M |       $105.95M |           $116.60M |               1581 |
|    7 |        $90.40M |       $105.75M |           $116.40M |               1582 |
|    8 |        $90.50M |       $105.90M |           $116.60M |               1583 |
|    9 |        $90.35M |       $105.70M |           $116.30M |               1584 |
|   10 |        $90.40M |       $105.70M |           $116.30M |               1585 |
|   11 |        $90.35M |       $105.65M |           $116.25M |               1586 |
|   12 |        $90.40M |       $105.65M |           $116.25M |               1587 |
|   13 |        $90.35M |       $105.65M |           $116.30M |               1588 |
|   14 |        $90.40M |       $105.65M |           $116.30M |               1589 |

The 15-player payroll spread is **$0.40M**, about
**0.38%** of the mean. Twelve rounds give each team rank sum 1,014.
Fifteen rounds leave rank sums from 1,576 to 1,589, averaging 1,582.5. This is
approximately balanced by rank, not proof of equal underlying talent.

Figures display to $0.01M. Individual salaries are rounded to $50K before
summation; team averages and blended scenarios need not be $50K multiples.

## Contract mix and the proposed $100M cap

The illustrative scenario blends 50% of the base-price payroll, 25% of the
renewal payroll, and 25% of the normal maximum-UFA payroll. Each scenario first
rounds every player's salary to $50K, then sums it. Only afterward are scenario
totals blended. This is a sensitivity illustration, not a discrete allocation
of contract types to particular players or a forecast.

Without rounding the multiplier would be 1.14625, but applying that multiplier
directly to the base total would miss the per-player rounding differences.

| Players per team | Average under this mix | Amount above $100M |
| ---------------: | ---------------------: | -----------------: |
|               12 |               $103.69M |             $3.69M |
|               14 |               $115.76M |            $15.76M |
|               15 |               $121.32M |            $21.32M |

For the 15-player benchmark, alternative caps leave the following room before
buyouts, outgoing retention, and additional reserved offers. Negative values
mean the modeled payroll already exceeds the cap.

| Cap being tested | Room at base prices | Room at 110% | Room under illustrative mix |
| ---------------: | ------------------: | -----------: | --------------------------: |
|            $100M |             -$5.83M |     -$16.45M |                    -$21.32M |
|            $110M |              $4.18M |      -$6.45M |                    -$11.32M |
|            $115M |              $9.18M |      -$1.45M |                     -$6.32M |
|            $120M |             $14.18M |       $3.55M |                     -$1.32M |
|            $125M |             $19.18M |       $8.55M |                      $3.68M |
|            $130M |             $24.18M |      $13.55M |                      $8.68M |

$100M is the selected proposal; the other rows are sensitivity comparisons.
At that cap, the modeled 15-player group is $5.83M over at base prices,
$16.45M over at renewal prices, and $21.32M over under the blend.
Cheaper depth, existing lower-cost commitments, or fewer signed players create room.

## UFA bid levels and their effect on cost

Offers run from 100% to 135% of the UFA minimum in 5% steps. The minimum is
110% of base salary. For a player with a $4M base salary:

| Nominal offer as % of minimum | Nominal offer as % of base | Rounded annual salary | Normalized salary score |
| ----------------------------: | -------------------------: | --------------------: | ----------------------: |
|                          100% |                     110.0% |                $4.40M |                   0.000 |
|                          105% |                     115.5% |                $4.60M |                   0.129 |
|                          110% |                     121.0% |                $4.85M |                   0.290 |
|                          115% |                     126.5% |                $5.05M |                   0.419 |
|                          120% |                     132.0% |                $5.30M |                   0.581 |
|                          125% |                     137.5% |                $5.50M |                   0.710 |
|                          130% |                     143.0% |                $5.70M |                   0.839 |
|                          135% |                     148.5% |                $5.95M |                   1.000 |

Percentages in the table are **nominal targets before rounding**. Calculate
each offer from the rounded base and nominal multiplier, then round the final
annual salary to the nearest $50K. Do not round the minimum and then compound
the bid steps from it. Renewal salaries use the same final rounding rule.

The nominal $5.94M maximum in this example becomes **$5.95M**. Three years
reserves $5.95M in **each** covered season. Salary score uses the actual rounded
offer and rounded endpoints: `(offer - minimum) / (maximum - minimum)`.
This keeps minimum and maximum scores at zero and one despite rounding.
The 2028 market applies the same method to nominal 100%–150% base-price targets.

Retention shares and buyout charges are cap allocations, not new salaries;
calculate their agreed percentages exactly rather than rounding the shares
independently and changing the total obligation. Existing signed salaries stay fixed.

The UFA score is 45% salary, 25% term, 20% roster fit, 5% previous performance,
3% Owner Ladder, and 2% draft capital. Salary is normalized as
`(offer - rounded minimum) / (rounded maximum - rounded minimum)`; terms of one, two, and three years score
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
signing starts a new cycle. A player who returns through the draft receives
the normal cap-free drafted season. UFA now overlaps the draft, so shared-pool
eligibility and reservations must prevent competing acquisitions. These routes and
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
5. Publish salaries when the GSHL season ends, alongside the applicable cap,
   curve, and eligibility, for binding re-signings through June 30. UFA begins
   July 1 and the draft begins August 1.

No live ratings, franchise rosters, or contracts were queried for this update.
This is a reproducible salary-schedule benchmark, not a claim that production
currently implements or supports the proposed economy.

## Reproducing and checking the calculation

Ranks 1–3 receive $10M. For rank `r` between 3 and 400, set
`t = (r - start) / (end - start)`. Salary in millions is
`a*t^3 + b*t^2 + c*t + d` with these current-curve coefficients:

| Start | End |               a |               b |               c |               d |
| ----: | --: | --------------: | --------------: | --------------: | --------------: |
|     3 |  20 |  0.130014876882 | -0.094823794079 | -0.785191082803 | 10.000000000000 |
|    20 | 160 | -0.910728842565 |  2.226679762810 | -4.815950920245 |  9.250000000000 |
|   160 | 325 | -0.425353799770 |  0.822770636789 | -3.647416837019 |  5.750000000000 |
|   325 | 400 |  0.002926380568 | -0.012955033863 | -1.489971346705 |  2.500000000000 |

Convert to dollars and round with `Math.round(dollars / 50000) * 50000`.
Keep ranks 400 and later at $1M. For each renewal/UFA salary, multiply the
rounded base by the nominal factor and round that final salary to $50K again.
For normal UFA step `i = 0..7`, the factor is `1.10 * (1 + 0.05*i)`;
for 2028 step `i = 0..10`, it is `1 + 0.05*i`. Half increments round upward.

Local checks compare these independently derived coefficients with the actual
runtime at every tenth of a rank through 450; verify anchors, monotonicity,
bounds, salary increments, unique allocation, roster sizes, and payroll totals;
and verify renewal/UFA rounding and the $104M–$108M average target. No live
records were read and no runtime or production salaries were changed.

These checks do not replace the outstanding real-franchise simulations.
