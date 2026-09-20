# GSHL relaunch salary analysis

[Project overview](../../README.md) ·
[Owner proposal](gshl-relaunch-owner-proposal.md)

> Planning calculation, September 17, 2026. This uses hypothetical ranks, not
> an actual player-rating export. It changes neither live salaries nor contracts.

## Result

The five-anchor cubic curve values the top 168 players at **$1177.90M**
in total, or **$84.14M per team** across 14 teams. A 12-round snake
allocation produces payrolls from **$84.00M to $84.35M**. The
spread is about **0.42%** of average payroll.

An **$85 million cap** is the rounded base-salary benchmark. **$95 million** is
a candidate for testing with contract premiums: the same pool costs an average
of **$92.55M** at the proposed 110% RFA rate. Neither figure is a proven
final cap for the target of roughly 10–14 contracted players per team.

## A smooth curve through five salary targets

| Salary-model rank | Base annual salary |
| ----------------: | -----------------: |
|                 1 |        $10 million |
|                20 |         $9 million |
|               160 |         $5 million |
|               325 |         $2 million |
|               350 |         $1 million |

Use a **shape-preserving cubic curve (PCHIP)** that passes through all five
anchors exactly before rounding. It joins cubic polynomial segments with
continuous first derivatives and preserves the declining shape without
overshooting between anchors. This gives a smooth slope across the interior
anchors; it does not require the curvature itself to be continuous.
[Method reference: SciPy PCHIP documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.interpolate.PchipInterpolator.html).

Round each salary to the nearest $50,000. At rank 350, clamp to the $1 million
floor for all later ranks. The floor introduces a slope change at that boundary.
Contract premiums apply after calculating base salary.

| Example rank | Current rounded base salary | Proposed rounded base salary |  Change |
| -----------: | --------------------------: | ---------------------------: | ------: |
|            1 |                     $10.00M |                      $10.00M |  $0.00M |
|           20 |                      $9.05M |                       $9.00M | -$0.05M |
|           25 |                      $8.70M |                       $8.80M | +$0.10M |
|           50 |                      $7.60M |                       $7.90M | +$0.30M |
|           75 |                      $7.00M |                       $7.10M | +$0.10M |
|          100 |                      $6.35M |                       $6.40M | +$0.05M |
|          115 |                      $6.00M |                       $6.05M | +$0.05M |
|          150 |                      $5.10M |                       $5.20M | +$0.10M |
|          160 |                      $4.80M |                       $5.00M | +$0.20M |
|          168 |                      $4.50M |                       $4.85M | +$0.35M |
|          200 |                      $3.40M |                       $4.25M | +$0.85M |
|          250 |                      $1.80M |                       $3.50M | +$1.70M |
|          275 |                      $1.20M |                       $3.10M | +$1.90M |
|          300 |                      $1.00M |                       $2.60M | +$1.60M |
|          325 |                      $1.00M |                       $2.00M | +$1.00M |
|          350 |                      $1.00M |                       $1.00M |  $0.00M |

Current values use the existing rank-to-salary curve in
[player-rating-backfill.ts](../../scripts/src/domains/ranking/player-rating-backfill.ts),
with the same $50,000 rounding. This compares curves at each rank, not actual
signed contracts. Change means proposed minus current.

The unrounded $5 million anchor moves from rank **154 to 160**, the
$2 million anchor moves from rank **240 to 325**, and the
$1 million floor moves from rank **285 to 350**. That extends the priced
depth by 65 ranks before the floor, with substantially more salary value
through the deeper player pool. Keeping the floor at rank 350 means the
final decline from $2 million to $1 million happens over just 25 ranks.

For this first calculation, every rank is unique. Tied ratings would affect
exact totals. Keep the 110% RFA and 110%–137.5% UFA multipliers separate from
this base curve.

### Reproducing the curve

For a rank `r` within a segment, set `t = (r - start) / (end - start)`.
The base salary in millions is `a*t^3 + b*t^2 + c*t + d`. The coefficients
below are displayed to 12 decimal places; the calculation uses full precision.

| Start | End |               a |               b |               c |               d |
| ----: | --: | --------------: | --------------: | --------------: | --------------: |
|     1 |  20 |  0.184479574213 | -0.129852440340 | -1.054627133872 | 10.000000000000 |
|    20 | 160 | -0.736698216927 |  2.343280367880 | -5.606582150953 |  9.000000000000 |
|   160 | 325 | -2.232543624339 |  2.921608987809 | -3.689065363470 |  5.000000000000 |
|   325 | 350 |  0.239823867970 | -0.551418070869 | -0.688405797101 |  2.000000000000 |

Convert to dollars, then apply `Math.round(dollars / 50000) * 50000`.
The top is rank 1 at $10 million; ranks 350 and later are $1 million.

## All 14 teams

Distribute ranks 1–14 to teams 1–14, ranks 15–28 to teams 14–1, and repeat for
12 rounds. Each team receives 12 players with a rank sum of 1,014 and an average
rank of 84.5. Teams are hypothetical, without positional restrictions.

| Team | Assigned ranks                                      | Annual base payroll | At 110% |
| ---: | --------------------------------------------------- | ------------------: | ------: |
|    1 | 1, 28, 29, 56, 57, 84, 85, 112, 113, 140, 141, 168  |             $84.35M | $92.79M |
|    2 | 2, 27, 30, 55, 58, 83, 86, 111, 114, 139, 142, 167  |             $84.35M | $92.79M |
|    3 | 3, 26, 31, 54, 59, 82, 87, 110, 115, 138, 143, 166  |             $84.15M | $92.57M |
|    4 | 4, 25, 32, 53, 60, 81, 88, 109, 116, 137, 144, 165  |             $84.20M | $92.62M |
|    5 | 5, 24, 33, 52, 61, 80, 89, 108, 117, 136, 145, 164  |             $84.15M | $92.57M |
|    6 | 6, 23, 34, 51, 62, 79, 90, 107, 118, 135, 146, 163  |             $84.10M | $92.51M |
|    7 | 7, 22, 35, 50, 63, 78, 91, 106, 119, 134, 147, 162  |             $84.15M | $92.57M |
|    8 | 8, 21, 36, 49, 64, 77, 92, 105, 120, 133, 148, 161  |             $84.10M | $92.51M |
|    9 | 9, 20, 37, 48, 65, 76, 93, 104, 121, 132, 149, 160  |             $84.05M | $92.46M |
|   10 | 10, 19, 38, 47, 66, 75, 94, 103, 122, 131, 150, 159 |             $84.00M | $92.40M |
|   11 | 11, 18, 39, 46, 67, 74, 95, 102, 123, 130, 151, 158 |             $84.10M | $92.51M |
|   12 | 12, 17, 40, 45, 68, 73, 96, 101, 124, 129, 152, 157 |             $84.05M | $92.46M |
|   13 | 13, 16, 41, 44, 69, 72, 97, 100, 125, 128, 153, 156 |             $84.05M | $92.46M |
|   14 | 14, 15, 42, 43, 70, 71, 98, 99, 126, 127, 154, 155  |             $84.10M | $92.51M |

Column values are displayed to $0.01 million; totals use exact dollar values.

## How many players does the cap support?

Each row divides a different top-ranked pool evenly among the 14 teams. It is
not a claim that removing two players from every 12-player team gives the
10-player scenario, or that actual keeper choices follow a snake draft.

| Players per team |    Pool | Base payroll range | Average base | Average at 110% | Average at maximum UFA (137.5%) |
| ---------------: | ------: | -----------------: | -----------: | --------------: | ------------------------------: |
|               10 | Top 140 |    $73.80M–$74.10M |      $73.89M |         $81.27M |                        $101.59M |
|               12 | Top 168 |    $84.00M–$84.35M |      $84.14M |         $92.55M |                        $115.69M |
|               14 | Top 196 |    $93.10M–$93.50M |      $93.24M |        $102.56M |                        $128.20M |

The all-RFA and all-maximum-UFA columns are sensitivity cases, not forecasts.
As an illustrative mix, if half of base payroll is signed at base price, one
quarter at 110%, and one quarter at 137.5%, the effective multiplier is 1.11875.
The 12-player average becomes **$94.13M**, leaving about **$0.87M**
under a $95 million cap before buyouts or other obligations. These are shares
of base payroll, not shares of player count.

At base prices, even the balanced 14-player pool fits below $95 million. At
maximum UFA prices, even the balanced 10-player pool exceeds it. A cap cannot
guarantee 10–14 contracts for every mix of stars, bargains, and bidding choices.
The target concerns typical teams; there is still no numeric keeper limit.

## Equal rank is not yet equal talent

The current salary calculation in
[player-rating-backfill.ts](../../scripts/src/domains/ranking/player-rating-backfill.ts)
orders players using a market score:

`overallRating + 0.08 * (seasonRating ?? overallRating) + ageAdjustment`

That is the score to use for a salary-aligned talent comparison unless the
league deliberately changes the salary model to use overallRating alone. The
current implementation also groups adjacent equal overallRating values for
average-rank pricing, even though ordering uses market score; tie handling
should be made consistent before a final calibration.

An equal rank sum does not imply an equal sum of those scores: the talent gap
between ranks 1 and 2 can differ from the gap between 100 and 101. Also, equal
talent totals do not mathematically guarantee equal salaries under a nonlinear
rank-to-salary curve. This calculation establishes a close **rank-balanced**
salary result; it does not claim a verified talent-balanced result.

The total payroll and league average for a fixed 168-player pool remain the
same regardless of how those players are allocated. Only the team-to-team
spread changes. That makes $84.14 million a useful baseline even before the
actual ratings are available, subject to the tie and curve assumptions above.

## Validation before choosing the cap

1. Obtain a dated player-rating snapshot with overallRating, seasonRating, age,
   positions, and identifiers. Confirm the rating season and tie rules.
2. Rank players by the same market score used to create salaries, apply the
   curve, and select the top 168. Divide them into 14 teams of exactly 12,
   minimizing differences in summed market score, then report both rating and
   salary spreads. Do not balance salaries and describe that as a talent test.
3. Repeat with plausible positional mixes and the top 140 and 196 pools. A
   12-player keeper group does not have to fill all 15 main-roster positions.
4. Model representative real franchises and several offseasons, preserving
   existing signed salaries and adding first contracts, RFA/UFA premiums,
   buyouts, retained salary, and temporary UFA cap reservations. Include
   contracted reserves and cheaper players outside the top 168.
5. Compare caps around $85M, $90M, $95M, $100M, and $105M by affordable keeper counts,
   talent retained, and room for offseason transactions. Choose the cap that
   supports the 10–14 target with meaningful decisions for typical franchises.

No local rating export or configured Convex connection was available for this
calculation. Actual rating-balanced allocations and contract simulations remain
outstanding. The official salary curve and cap have not been changed.

## Calculation checks

The local planning calculation checks all five anchors; the non-increasing
curve and salary bounds at 0.1-rank intervals through rank 400; continuous slopes
at interior joins; agreement between coefficient and Hermite-basis evaluation;
each rank appearing exactly once; equal player counts and rank sums; and
payroll totals for the 140-, 168-, and 196-player pools. Salary rounding is
applied per player before summing. These checks validate the calculation,
not the missing real-player talent and contract simulations.
