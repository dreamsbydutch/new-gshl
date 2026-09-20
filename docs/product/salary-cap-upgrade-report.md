# GSHL Salary Cap and Keeper System Upgrade Report

[Project overview](../../README.md) ·
[Official rulebook](../../src/content/rulebook.ts)

> **Status:** Proposal for offseason discussion, not an active league rule.
> The official rules remain the structured rulebook in
> [`src/content/rulebook.ts`](../../src/content/rulebook.ts).

**Prepared:** August 22, 2026

## Recommendation

Pilot a **Hard Cap 2.0** system for one season:

- keep the 15-player active roster, one IR slot, and one IR+ slot;
- raise the absolute hard cap from **$25 million to $30 million**;
- add a lower **$27 million keeper-declaration ceiling** so every team enters
  the season with at least $3 million of transaction capacity;
- allow no more than **six playing contracts** per team;
- permit one tightly limited retained-salary obligation per team, capped at the
  lower of **25% of the traded contract or $2 million**;
- keep retained salary charged to the selling team for every remaining contract
  season, so no cap obligation disappears;
- remove the extra following-season charge from new final-year buyouts while
  retaining the existing 50% charge during the contract seasons that remain;
- cap the synchronous draft at ten open-player selections per team and fill any
  remaining openings from submitted queues in a short supplemental phase; and
- add a real trade block, multiyear deal builder, notifications, and an atomic
  trade transaction in the GSHL App.

This is still a hard-cap league. No team may exceed $30 million in any covered
season, and every playing, buyout, retained-salary, and pending-offer obligation
must be counted. The $27 million ceiling is not extra cap relief. It is a lower
offseason commitment limit that preserves a $3 million band for trades.

The recommended package intentionally does **not** enlarge rosters. A larger
roster does not create cap space, makes the draft longer, thins waivers, and can
reduce the need to make active roster decisions.

## What the current system is designed to do

The current system combines continuity with annual redistribution:

| Rule              | Current behavior                                                             |
| ----------------- | ---------------------------------------------------------------------------- |
| League and roster | 14 teams; 15 active roster spots, plus IR and IR+                            |
| Hard cap          | $25 million in every covered season                                          |
| Cap scope         | Playing contracts and active buyout charges only                             |
| Drafted players   | No cap hit unless later signed to a contract                                 |
| Keeper limit      | No explicit maximum; the cap and available draft picks govern                |
| Keeper draft cost | Each contract replaces the team's latest available pick                      |
| Contract term     | One, two, or three years                                                     |
| Player control    | No more than two consecutive contracts                                       |
| Initial signing   | 100% of the current official GSHL salary                                     |
| RFA extension     | 115% of the updated official salary                                          |
| Summer UFA        | 125% of the updated official salary                                          |
| Trade             | Full salary and remaining term transfer to the buyer                         |
| Salary retention  | Prohibited                                                                   |
| Buyout            | 50% for the remaining term; a final-year buyout also reaches the next season |

This is a strong parity framework. Stars are expensive, contracts expire,
keepers consume draft selections, and no team can buy its way around the cap.
The problem is not that the hard cap fails. The problem is that almost every
team rationally uses almost all of it, leaving no market-making cap space.

### Salary economics

The official salary is rank-based after a multiseason player-rating process.
The current curve is approximately:

| Salary rank | GSHL salary |
| ----------: | ----------: |
|         3.5 |      $10.0M |
|          21 |       $9.0M |
|          35 |       $8.0M |
|         154 |       $5.0M |
|         240 |       $2.0M |
|         285 |       $1.0M |

Values between those points are interpolated and rounded to $50,000. This is a
top-heavy curve against a $25 million cap: three elite players can consume the
entire cap, while a normal mix produces roughly three to five keepers. That is
consistent with the observed keeper distribution.

## Evidence from league data

A read-only aggregate of the public production data was taken on August 22, 2026. It included seasons, contracts, draft picks, teams, franchises, and player
salary rows. No production data was changed.

### Current cap congestion

For the 2026–27 season:

- median committed cap is **$23.95 million**, leaving only $1.05 million;
- 13 of 14 teams have at least $20 million committed;
- 8 of 14 have at least $23 million committed;
- 6 of 14 have at least $24 million committed; and
- the highest commitment is $24.875 million.

The user-observed problem is therefore structural, not anecdotal. More than half
the league has less than $2 million of room, and almost half has less than $1
million. An ordinary signed-player trade can only work when incoming and
outgoing cap are nearly identical.

### Buyout drag

The 2026–27 data contains 11 active buyout charges across 8 teams, totaling
about **$13.64 million**. Buyouts are correctly acting as a cost for abandoning
a contract, but the final-year extra season and long dead-money tails also
remove potential trade capacity from most of the league.

### Keeper and draft load

The completed 2025–26 draft contains:

- 210 total draft slots;
- 52 keeper slots;
- 158 open-player selections;
- a median of 4 keepers among all 14 teams; and
- a maximum of 5 keepers.

That is about eleven live selections per team even before allowing for pauses,
missed turns, and absent owners. Adding one keeper per team would remove only 14
live selections. Keeper expansion can shorten the draft slightly, but it cannot
solve attendance or preparation on its own.

The stored draft rows do not identify manual, queued, proxy, or automatic picks,
and historical clock fields are not populated. The present data therefore
cannot independently quantify no-shows or autodraft use. Those need explicit
tracking in the next draft workflow.

### Signed-player trade scarcity

The contract history contains only ten rows recorded with a trade signing
status: one in 2021–22, five in 2022–23, and four in 2023–24. None are recorded
in the 2024–25 or 2025–26 signing classes. Historical transaction representation
is imperfect, so this is not a complete count of every Yahoo trade, but it is
consistent with the reported disappearance of contracted-player trades.

## Diagnosis

### 1. Spending to the cap is rational

Unused cap has no durable value. It does not roll forward, improve draft
position, or create another competitive benefit. Because UFA prices are fixed
and offers are not dollar bids, owners cannot save cap for a later bargain in
the way a real-money auction team might. The rational offseason choice is to
retain the best affordable players until very little room remains.

### 2. A hard cap needs available counterparties

A hard cap prevents unequal spending, but it does not create liquidity. When
nearly every team is at the same ceiling and contracts transfer at full value,
every deal must be almost dollar-for-dollar. Position, talent, term, and draft
picks become secondary to salary matching.

### 3. Buyouts are widespread and retention is unavailable

Eight current teams carry buyout money, and that dead cap cannot be traded.
With retention completely prohibited, there is no narrow tool for bridging a
$2–5 million mismatch even when both teams prefer the hockey value of the deal.

### 4. Larger rosters address the wrong constraint

Roster slots and cap room are independent because drafted players do not count
against the cap. Adding bench positions would create more draft selections and
more stashing without making a single contracted-player trade easier. It would
also thin the waiver pool, reducing a common source of in-season management.

### 5. Keeper expansion and engagement can conflict

More keepers create identity and continuity, but they also reduce the quality
of the draft pool and can make teams more set-and-forget. Keeper expansion
should therefore be modest and paired with a shorter, better-prepared draft and
lower-friction transaction tools. It should not be treated as the solution to
inactive ownership.

### 6. Product friction compounds the rule problem

The current Cap Lab can simulate signings, removals, and trades, but it does not
submit a deal. Yahoo processes ordinary roster trades, while the GSHL contract
transfer and multiyear cap checks are not one atomic league transaction. Even a
legal idea therefore requires negotiation, manual verification, Yahoo action,
and contract-record administration.

## Options considered

| Option                                   | Keeper continuity | Trade flexibility | Draft effect          | Parity             | Assessment                                                          |
| ---------------------------------------- | ----------------- | ----------------- | --------------------- | ------------------ | ------------------------------------------------------------------- |
| Raise the cap only                       | Higher            | Temporary         | Fewer available stars | Good initially     | Teams will fill the new cap and recreate the same lock              |
| Add roster spots                         | Little change     | None              | Longer draft          | Neutral            | Makes the stated problems worse                                     |
| Reduce salaries only                     | Higher            | Temporary         | Fewer available stars | Transition risk    | Equivalent to a cap increase and rewrites contract expectations     |
| Allow unrestricted retention             | Higher            | High              | Neutral               | Weak               | Too easy to subsidize contenders and too complex                    |
| Require unused cap under $25M            | Lower             | High              | More players return   | Strong             | Solves liquidity by reducing keeper capacity                        |
| Two-tier hard cap plus limited retention | Modestly higher   | High              | Manageable            | Strong             | Best balance if paired with draft reform                            |
| Replace the draft with an auction        | Different system  | Indirect          | Major change          | Potentially strong | Duplicates the salary system and discards a valued league tradition |

## Hard Cap 2.0 in detail

### Financial rules

1. **Absolute hard cap: $30 million.** No team may exceed it in the current or
   any covered future season.
2. **Keeper-declaration ceiling: $27 million.** New contracts, extensions,
   Summer UFA commitments, buyouts, retained amounts, and pending offers all
   count. A team above $27 million because of an in-season acquisition may not
   add another contract and must return to $27 million by its next keeper
   declaration.
3. **Maximum six playing keepers.** Buyout and retained-salary charges count
   against money but not the six player slots.
4. **Existing contract terms remain fixed.** The one-to-three-year choice,
   100% initial salary, 115% RFA price, 125% UFA price, and two-consecutive-
   contract limit stay in place for the pilot.
5. **No cap banking or trading cap space.** Unused room cannot be sold, carried
   forward, or separated from a player transaction.

The current median team would have about $3.05 million available below the
$27 million declaration ceiling. That is enough to add one lower- or mid-tier
continuity player without opening room for another elite keeper. A team that
spends to $27 million still begins the season with exactly $3 million of trade
capacity under the absolute ceiling.

### Limited retained salary

- A selling team may retain the lower of 25% of the player's cap hit or $2
  million.
- The same percentage applies in every remaining contract season.
- The retained amount counts against the seller; the remainder counts against
  the buyer. Together they always equal the original cap hit.
- A team may carry only one active retained-salary obligation at a time.
- A contract may be retained only once; no double-retention chain or cap-only
  transaction is allowed.
- Both teams must remain at or below $30 million in every affected season.
- Retention cannot be applied to an existing buyout charge.

Retained salary is compatible with a hard cap when the seller keeps the charge
and both teams remain below the ceiling. The NHL/NHLPA agreement uses that same
basic conservation principle, although the GSHL limits proposed here are much
narrower. See the official [NHL collective bargaining agreement](https://media.nhl.com/site/asset/public/ext/CBA.pdf)
and [2025 memorandum of understanding](https://media.nhl.com/site/vasset/public/attachments/2025/07/19116/NHLPA-NHL-MOU-June-27-2025.pdf).

### Buyouts

For buyouts created after the pilot begins:

- retain the 50% cap charge for each contract season that remains;
- eliminate the extra following-season charge when a player is bought out in
  the final contract year;
- keep buyout charges non-tradable and ineligible for retention; and
- grandfather every charge already recorded under the existing rules.

This preserves meaningful contract risk while removing an especially rigid
dead-money tail. The league should not add a recurring amnesty buyout; routinely
erasing mistakes would weaken both the hard cap and contract strategy.

### Worked trade examples

Two teams begin at the $27 million declaration ceiling.

**Example A: $8 million for $5 million.** The team receiving the $8 million
player rises to exactly $30 million, while the other falls to $24 million. The
deal is legal without retention. Under the current $25 million cap, it would be
illegal.

**Example B: $9 million for $4 million.** Without retention, the buyer would
reach $32 million. If the seller retains $2 million, the buyer receives a $7
million charge and finishes at $30 million. The seller finishes at $24 million:
$27M - $9M + $2M retained + $4M incoming. The league-wide $13 million of cap
obligation is conserved.

### Keeper and draft rules

- Keepers continue to consume the team's latest available draft selections.
- No team is required to keep a player. A rebuilding or weak roster must remain
  free to return everyone to the pool.
- Six is a maximum, not a target. The cap should still make expensive sixth
  keepers difficult.
- Each team makes no more than ten open-player selections during the synchronous
  draft event.
- Remaining empty roster spots are filled in normal order during a short
  supplemental phase using owner-submitted queues. A missing queue falls back
  to the published league ranking and positional roster needs.
- Owners may designate a proxy before the draft.
- Every pick records whether it was manual, queued, proxy, commissioner-forced,
  or automatic, along with clock timing.

Yahoo already supports keeper declaration deadlines, replacing picks with
keepers, pre-draft rankings, queues, and automatic selections for absent
owners. Those are useful operational precedents even if the GSHL App remains
the authority for this league's draft. See Yahoo's official guidance for
[keeper leagues](https://ca.help.yahoo.com/kb/fantasy-hockey/keeper-settings-sln6111.html),
[pre-ranking and autodraft](https://help.yahoo.com/kb/fantasy-hockey/autopick-draft-sln6163.html),
and the [live draft queue](https://help.yahoo.com/kb/fantasy-hockey/participate-live-standard-draft-sln6230.html).

### Participation and transaction tools

Cap reform should lower the effort needed to participate rather than create
standings penalties for missed administrative tasks. The app should add:

- keeper-declaration and draft-readiness checklists;
- deadline and on-clock notifications;
- a required pre-draft queue or named proxy;
- player trade-block states such as available, listening, and unavailable;
- team needs, surplus positions, and desired pick years;
- a multiyear trade builder using the canonical cap ledger;
- proposal, counter, accept, reject, and expiry states; and
- an atomic completion step that moves players, contracts, retention, and draft
  picks together only after both teams pass every cap check.

Repeated no-shows are ultimately an ownership and governance issue. The
rulebook should define an escalating contact and replacement process for an
owner who repeatedly misses the draft, keeper deadline, or basic lineup duties.
Competitive advantages such as extra cap or picks should not be awarded for
routine participation.

## Required system cleanup before changing the rules

The current application is a strong base, but the new system should not be
implemented on top of several existing source-of-truth gaps.

### Centralize the cap ledger

The $25 million value is hard-coded independently in contract utilities, the
Cap Lab, UFA resolution, and publication facts. The season schema has no cap or
keeper-policy configuration. Add season-owned rule fields and one pure cap
engine used by every UI preview and server mutation.

The ledger must produce, for each owner and season:

- playing-contract charges;
- buyout charges;
- retained-salary charges;
- pending UFA reservations;
- keeper count;
- declaration-ceiling space; and
- absolute hard-cap space.

### Enforce contracts on the server

The active commissioner UI derives the proper signing type, multiplier, dates,
expiry status, and multiyear cap result. The current `frontend:createContract`
server mutation does not repeat those rules: it writes base salary, a standard
drafted contract, and a generic UFA expiry without applying the shared cap or
eligibility calculation. Its start/expiry season selection also differs from
the UI's next-season terms.

Summer UFA is safer: pending offers reserve cap and the mutation checks every
covered season. Ordinary contract creation, a future buyout mutation, and the
new trade mutation should all use the same server-side invariant.

### Reconcile salary calculation authority

The rulebook describes five years of NHL inputs, while both current salary
implementations use up to four seasons. The local TypeScript backfill also adds
an age-based market adjustment when ordering salaries, while the active Apps
Script `PlayerOverallRatingUpdater` does not. Before changing cap numbers, the
league should select one authoritative salary calculation, synchronize it, and
test representative forwards, defensemen, and goalies.

### Preserve contract history as transactions

A trade should not be represented as an ambiguous second contract or a manual
owner edit. Store an immutable transaction record that identifies the original
contract, seller, buyer, retained portion, included picks, effective time, and
all post-trade cap results. Current contract-history over-cap anomalies should
be reconciled before using older seasons to tune the new thresholds.

## Transition plan

### Phase 0: decide and clean up

During the 2026–27 season:

1. discuss the proposal with all owners under the existing offseason rule-change
   process;
2. settle the authoritative salary calculation;
3. centralize cap configuration and server enforcement;
4. reconcile current contracts and buyouts against the new ledger; and
5. ship draft pick-source tracking and the trade proposal workflow in read-only
   or simulation mode.

No 2026–27 contract should be retroactively repriced or shortened.

### Phase 1: 2027–28 pilot

- Existing playing contracts keep their salary and term.
- Existing buyout charges remain under the old schedule.
- The $27 million declaration ceiling, $30 million hard cap, six-keeper maximum,
  and new-buyout rule begin with the 2027–28 keeper declaration.
- Retention is available only on trades completed after the pilot starts.
- The ten-selection live draft and supplemental queue phase are used once.
- The rule package expires after the season unless the league renews it.

### Phase 2: review

Keep the pilot only if it improves liquidity and participation without a
material parity loss. Do not immediately change the salary curve, contract
premiums, and consecutive-control limit at the same time; too many moving parts
would make the result impossible to diagnose.

## Pilot scorecard

Record these measures under both the 2025–26/2026–27 baseline and the pilot:

| Outcome           | Measure                                                                           |
| ----------------- | --------------------------------------------------------------------------------- |
| Keeper continuity | Median, range, and salary distribution of keepers per team                        |
| Trade liquidity   | Proposed, accepted, and completed signed-player trades                            |
| Cap liquidity     | Teams with at least $1M, $2M, and $3M available at opening day and trade deadline |
| Draft engagement  | Attendance, manual-pick rate, queue coverage, expired clocks, and total duration  |
| Active management | Weekly roster moves, missed starts, and unresolved lineup alerts                  |
| Parity            | Standings spread, team-talent spread, playoff turnover, and title concentration   |
| Administration    | Commissioner interventions, failed transactions, and corrections                  |

Suggested success conditions are:

- at least half the teams retain $2 million of room at opening day;
- at least four completed signed-player trades during the season;
- at least 90% of draft turns are manual or owner-queued rather than default
  automatic picks;
- the synchronous draft is materially shorter than the 158-selection baseline;
- no cap violation survives an accepted transaction; and
- standings and roster-talent dispersion do not materially worsen relative to
  the preceding three comparable seasons.

## Decisions the owner group still needs to make

1. Is the desired keeper target about four to five, or five to six players per
   team? The proposed $27 million declaration ceiling aims for modest expansion,
   not a deep dynasty league.
2. Should retained salary last for the full remaining contract, as recommended,
   or only through the current season? A one-season limit is simpler but does
   little for multiyear deals.
3. Is ten live selections per team the right event length, or should the target
   be nine?
4. What repeated behavior qualifies as owner inactivity, and what contact and
   replacement process is acceptable?
5. After the pilot, should total consecutive player control be reduced from a
   possible six seasons to five if the draft pool becomes too shallow?

## Bottom line

The GSHL should keep a hard cap. The cap is doing its parity job, but the league
has not reserved any liquidity inside it. A larger roster or a simple cap raise
will not solve that. A $27 million declaration ceiling under a rigid $30 million
hard cap creates a universal transaction band; one narrow retained-salary slot
bridges larger mismatches without erasing money; a six-keeper maximum permits
modest continuity; and a ten-selection live draft with prepared queues directly
addresses no-shows.

That package keeps the core identity of the league—contracts, consequences,
continuity, and a meaningful annual draft—while making it easier for owners to
act during the season.
