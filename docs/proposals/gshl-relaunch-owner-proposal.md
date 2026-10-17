# GSHL Relaunch

[Project overview](../../README.md) ·
[Current rulebook](../../src/content/rulebook.ts) ·
[Salary analysis](gshl-relaunch-salary-analysis.md) ·
[Worked examples and acceptance checks](gshl-relaunch-acceptance.md)

> **Owner discussion proposal.** This records the agreed direction for the
> relaunch, not the currently adopted rules or a claim that every feature is
> built. The target is the **2027 draft**, subject to readiness. Financial
> calibration and the remaining launch work are identified below.

## 23 players, no daily bench decisions

Each franchise would have **15 main-roster players and eight reserves**.
Everyone on the main roster is eligible to score. Owners choose the players;
the app handles legal positional arrangement and selects the strongest complete
game performances through **best-ball scoring**.

| Roster      | Players | Role                                             |
| ----------- | ------: | ------------------------------------------------ |
| Main roster |      15 | 3 C, 3 LW, 3 RW, 4 D, and 2 G; eligible to score |
| Reserves    |       8 | Owned depth; must be promoted to score           |
| **Total**   |  **23** | Full franchise roster                            |

There would be no daily bench to set and no IR or IR+ slots. An injured player
could remain on the main roster or move to reserve using a normal roster move.
Reserves remain fully owned: they can be traded, carry contracts and salaries,
and accumulate signing eligibility.

The app would arrange multi-position players automatically. Owners would not
need to move a C/LW between positions every day. Each selected performance can
occupy only one eligible position, with all appearance limits enforced together.

Positional eligibility would be published before the draft and locked at the
start of the season. There are no midseason additions, removals, or corrections
to a player's eligible positions. Changes wait until the next offseason.
New players entering the pool midseason receive an initial position assignment
for that season; subsequent position changes wait until the offseason too.

Vacancies would be legal. Teams must respect roster maximums, positional
capacity, and the cap, but need not acquire someone merely to fill an empty
spot. Vacancies provide no extra scoring capacity or moves.

## More time talking hockey, less time maintaining lineups

Owners still want a deep league, but have less time for fantasy hockey. The
relaunch should move that time toward **trade conversations, roster
construction, and week-to-week strategy**.

Daily maintenance would no longer be required. An owner could leave a sound
roster in place and compete, while someone with an idea for improving their team
would have reasons to approach another owner. Trading should be the most
reliable route to a specific upgrade; waivers should help fill holes without
replacing the trade market.

Active management is still intended to provide an advantage. Owners who study
their roster and manually select performances can improve their results; the
automatic system provides a competitive default without requiring that work.

GSHL would keep its 14 franchises, two seven-team conferences, head-to-head
categories, home-ice tiebreaker, Cup and playoff structure, Owner Ladder, and
long-term team identities. The draft moves to a slow online format that owners
participate in over multiple days.

## The entire league in the GSHL App

The entire league would run in the **GSHL App**, with no Yahoo league. Rosters,
reserve moves, claims, trades, contracts, UFA, the draft, schedules, standings,
and official results would all live in one place.

The scoreboard would show the category score, which performances count, which
are below the cut, remaining capacity, and when a stronger game replaces an
earlier one. Owners should be able to understand a result without reconstructing
it themselves.

ESPN and NHL API endpoints are the league's information sources. Complete owner
workflows, dependable ingestion, and GSHL's own published eligibility,
transaction, scoring, and recovery rules are requirements for launch. The data
integration uses the NHL API as the authority whenever it disagrees with ESPN.
This precedence does not reopen completed matchups or change locked positions.

## How a matchup would work

The seven skater categories remain goals, assists, points, power-play points,
shots, hits, and blocks. Goalies compete in wins, goals against average, and
save percentage. Home ice decides a matchup tied in total categories.

### Best-ball selects whole performances

Each eligible main-roster player-game supplies a candidate performance. After
each NHL day, the app recalculates the selection using GSHL player ratings.
Every eligible performance counts until an appearance limit requires a cut.

A performance counts as a whole: the app cannot take a goal from one game and
hits from another to create one appearance. Automatic selection uses the same
rating rule for everyone. Ratings determine the primary selection; equally
rated performances are compared in the matchup's closest category first: the
performance with the better value in that category wins. If still tied, compare
the second-closest category, then the third, and continue as needed. Higher
values are better except for GAA, where lower is better. This comparison cannot
displace a higher-rated performance.

**Closest category uses typical game impact:** divide each category's matchup
gap by a calibrated measure of a typical eligible game's impact in that
category. Smaller values indicate gaps that require less ordinary game
production to change hands. The [worked examples](gshl-relaunch-acceptance.md)
define the calculation and record its historical calibration. These are fixed
comparison units, not extra category weights.

**Skaters and goalies are evaluated separately.** Skater selection fills the
available skater allowance, subject to eligible games and positional limits,
and uses only the seven skater categories for tiebreaks. Goalie selection uses
its own allowance and only wins, GAA, and save percentage. The app never weighs
a goalie category against a skater category to choose between their games.

Use one shared snapshot before applying category tiebreaks
and keep that category order fixed for the calculation. Do not let each
selection recursively redefine which category is closest. Goalie comparisons
must evaluate the effect on combined GAA/save-percentage totals, not compare
isolated game percentages.

The app first makes legal selections for both opponents using game ratings,
owner pins, and a stable game-ID fallback. Those preliminary totals establish
the category order. It then makes the final selections with that order fixed.
Identical ratings and category values fall back to the canonical player-game
ID, so processing the same games in a different order cannot change the result.
The existing RankingEngine day-performance profile supplies game ratings,
using the same matchup-wide NHL comparison pool for every franchise. Its
version is frozen for the season; the full calculation is in the worked examples.

For example, 16 center performances cannot all fit under a 14-appearance center
limit. Some could also miss the cut because of the overall skater limit. A
stronger performance later can replace one currently counting. Reaching a limit
does not lock in the earlier games.

Schedules still matter: extra games create more chances at strong performances.
The limits keep a favorable schedule from creating unlimited counting-stat volume.

### Optional owner overrides

Owners can optionally override the app's selections directly in the games
table, toggling which eligible **skater and goalie performances** count toward
the week's totals. In a standard seven-game-day matchup, that means choosing
the games included in the **45 skater appearances**. Goalies use the separate
three-appearance baseline and optional additions described below. Skater
allowances scale with matchup length.

Automatic best-ball remains the default for owners who make no changes. An
owner could choose a lower-rated game because its production better suits the
category matchup. The table would show which selections are manual and let the
owner return to automatic selection.

Overrides change only which whole performances count. They cannot include
reserve-only or otherwise ineligible games, count a performance twice, or
exceed overall or positional limits. They do not move players between roster
tiers or consume acquisition or reserve moves. Manual selections stay editable
until the matchup is finalized, independently of player transaction locks.
Finalized matchup results remain locked.

Owners use **pin this game** to preserve an explicitly selected performance.
Everything unpinned remains automatic. New, higher-rated games replace the
lowest-rated eligible unpinned games, subject to the relevant skater or goalie
limits and positional constraints. The app never silently removes a pin just
because the game has a low rating. It can flag the cost of a pin and offer a
reset to automatic selection. If all usable slots are pinned, a new game
cannot displace them automatically.

Pins apply only to the current matchup. If preserving all pins would violate
an appearance or positional limit, remove the lowest-rated conflicting pins
until a legal selection is possible. The app shows which pins were removed
and why. This legality exception does not otherwise let automation undo pins.

### Longer means more NHL game days

Only calendar dates on which NHL games are actually played count toward matchup length. A matchup
spanning two calendar weeks but containing six NHL game days is a six-day
matchup. Breaks do not add capacity. Postponed games receive no special
make-up treatment: they count in the matchup week in which they are actually
played, not their originally scheduled week.

Appearance limits are recalculated when postponements change that count. If
every game on a date is postponed, that date adds no capacity; if any game is
played, it still counts as one NHL game day. Move allowances remain unchanged.

The starting allowances for testing are:

| NHL game days | All skaters | C max | LW max | RW max | D max | Goalie minimum |
| ------------: | ----------: | ----: | -----: | -----: | ----: | -------------: |
|             6 |          39 |    12 |     10 |     10 |    15 |              3 |
|             7 |          45 |    14 |     12 |     12 |    18 |              3 |
|            10 |          65 |    20 |     17 |     17 |    26 |              3 |
|            14 |          91 |    28 |     24 |     24 |    36 |              3 |

For `N` NHL game days, the overall skater limit is `floor(6.5 × N)`, centers
`2 × N`, each wing `round(12 × N ÷ 7)`, and defense `round(18 × N ÷ 7)`.
Positional ceilings are not guaranteed allocations and do not add up to the
overall ceiling.

The goalie minimum is **three appearances**. Starts and relief appearances
count equally; there is no separate starts requirement. Automatic selection
starts with the best three appearances by goalie performance rating, respecting
owner pins. With fewer than three available, all available appearances count
and the forfeiture rule applies.

There is no fixed upper limit. Automation considers combinations of additional
appearances and adds them only when the combined result **does not worsen
either GAA or save percentage**, and improves at least one ratio or adds wins.
It evaluates combinations rather than accepting games in arrival order.
Owners may pin additional appearances that involve a tradeoff, such as adding
a win while worsening a ratio. Automatic additions are evaluated relative to
the baseline including those pins. GAA and save percentage always use combined
underlying totals, not averages of game percentages. Among qualifying
combinations, compare the three goalie categories in the fixed closest-category
order using typical game impact. Owner pins remain authoritative. Exact ties
prefer fewer optional appearances, then the canonical player-game IDs.

A team with fewer than **three goalie appearances forfeits all three goalie
categories**: wins, GAA, and save percentage. If both teams miss the minimum,
the goalie categories are **excluded entirely**, rather than recorded as tied
categories. That matchup is decided using only the seven skater categories,
with the normal home-ice tiebreaker if needed.

### Completed results stay final

Matchups become final at **noon Eastern on Monday following the end of the
matchup**. Owners can review games and edit selections until that hard cutoff.
Final statistics are expected to be processed beforehand; changes received
after noon are disregarded for the completed matchup.

At noon, the app finalizes results, determines eliminations, calculates power
rankings, and runs the league's weekly closing processes using that final
snapshot. Apparent Sunday-night losses are not official eliminations before
this cutoff. New-week transactions remain separate from closing the prior
week's results.

Counted performances determine GSHL category totals and production-based awards.
Every eligible performance is also retained to explain selections and support
analysis. The underlying NHL talent model continues to use NHL performance
independently of which games GSHL selected.

## Weekly management and player game locks

Each team receives **two external acquisitions and four reserve moves per
matchup**. These allowances do not increase for longer matchups. Unused moves
expire.
The management period for a new matchup starts **Monday at 5 a.m. Eastern**.
Monday-morning roster transactions use the new matchup's allowances even
though the previous matchup's scoring remains editable until noon. A longer
matchup has one allowance for its full period, not a reset each Monday.

A normal reserve swap exchanges one player in each direction and uses one move.
Demoting an injured player and later bringing them back uses two. The app handles
movement between eligible main-roster positions automatically.

Accepted trades, awarded acquisitions, and main/reserve moves take effect
**immediately if every involved player is unlocked**. When a player's NHL game
starts, that player locks for the rest of the day, including after the game
finishes. Players unlock at **5 a.m. Eastern**. A transaction involving any
locked player waits as a complete unit for the next eligible **noon Eastern**
queue run after unlock. Both sides of a swap and any required drop are involved
players. Already-earned performances stay with the team and roster tier that
held the player when the game locked.

This replaces the league-wide 3 p.m./pregame transaction deadline. It does not
remove claim windows, waiver periods, or UFA offer clocks: an acquisition must
first be awarded before it can execute. Claims and queued transactions process
at **noon Eastern every day**, matching the Monday finalization cadence.
Unlocked main/reserve moves can execute at any time; they do not wait for noon.
The app shows each player's lock and the scheduled execution time. It rechecks
locks before executing a queued transaction: if an involved player has already
started a new game that day, the transaction remains queued.

Due decisions enter one queue and execute one at a time. There is no preferred
order among claims, signings, trades, and roster moves. The app records the
actual execution order and preserves existing reservations and transaction
requirements as each decision completes.
The season-end closeout described below is an exception to carrying pending
transactions forward: it processes eligible transactions, then cancels leftovers.

## Trading should be the main way to improve a team

Trades **do not consume the two-acquisition allowance**. Owners can negotiate
through WhatsApp or direct messages, then send a formal app offer showing
players, picks, contracts, retained salary, cap effects, and required roster moves.

Acceptance makes the agreement binding and immediately reserves the players,
picks, cap room, roster capacity, and required reserve moves needed to complete
the trade. Acceptance must satisfy roster, position, and cap rules, including
existing reservations. Later actions cannot spend or commit those reserved
resources or invalidate the accepted trade. The complete exchange executes
together immediately when all involved players are unlocked, or at the next
eligible noon queue run if any are locked. The postseason trading freeze still applies.
Picks-only trades can execute immediately during open trading periods.
There is no routine league vote or Commissioner approval.

Owners choose whether an incoming player joins the main roster or reserves. If
a player must move down to make room, that demotion uses one of the four reserve
moves. Directly replacing a departing main-roster player does not use a move.
Trades cannot provide free main/reserve reshuffling.

Only picks in the upcoming draft can be traded. Trade-block listings identify
at least one desired type of return. The app may suggest partners based on
needs, positions, categories, and cap room, but will not declare a trade “fair.”
Owners should acknowledge direct inquiries within 72 hours, even if the answer
is no.

## Waivers and free agents without a daily race

Dropped players spend **at least 48 hours on waivers**, then resolve at the first
daily claim closing time after that period. Other unowned free agents are available
through daily claims rather than immediate first-click acquisitions.
All available unowned players use the daily waiver wire and weighted draws.
Claims received **before noon Eastern** join that day's noon processing;
claims received at or after noon wait for the following day. An acquisition
awarded at noon executes then if all involved players are unlocked, otherwise
it remains queued until an eligible noon processing run.

Competing claims use a weighted draw, similar to UFA but **without a new
contract**. The claim score has two factors, each normalized from zero to one:

| Claim factor                              | Weight |
| ----------------------------------------- | -----: |
| Improvement to the best legal main roster |    75% |
| Relative roster weakness                  |    25% |

The model considers all 23 owned players and the proposed drop when assessing
the best possible main roster. No special safeguards against vacancy or demotion
strategies are required. Salary, contract term, Owner Ladder standing,
and draft capital do not affect claim scores. Better fit improves a chance;
it does not guarantee the award. Claims use the shared probability calculation
described below for UFA.

### Every claim is a commitment

There are no ranked backup claims. Each pending claim reserves an acquisition
and identifies a distinct player to drop or an available roster spot. An owner
must be able to accept **every outstanding claim**. A team with two acquisitions
available cannot make three binding claims hoping to lose one.

Acquisitions count against the week in which the transaction actually
**processes**, regardless of when it was submitted, scheduled, or awarded.
A Sunday award delayed by a player lock until Monday consumes a Monday-week
acquisition. Reserve moves use the same processing-week rule. Reservations
must cover the expected processing week and follow any execution delay; the
app must prevent owners from spending that reserved capacity elsewhere.
Known player locks must be considered when accepting a commitment. If an
unexpected delay moves it into a week without sufficient capacity, the binding
transaction remains queued until capacity is available; it cannot exceed the
weekly limit or silently cancel the commitment. Assets remain reserved and
the actual execution week receives the charge.
This carry-forward rule applies during the season. The season-end closeout
processes eligible transactions before freezing tournament rosters and cancels
anything still pending.
Losing releases the reservation; winning commits the acquisition
automatically, executing immediately unless an involved player is locked.
A free agent can enter either tier by replacing a player in that
tier or filling a legal vacancy. Dropping a contracted player triggers a buyout.

Displayed odds are provisional until closing. Final odds use the roster at
closing, and the app retains the inputs and draw result so the award can be
explained. Claims and UFA draws freeze their scoring inputs at their respective
closing times. Decisions sharing a closing time use the same pre-processing
snapshot, so earlier queue executions do not change later draw odds. Execution
still honors reserved assets and capacity.

## Keep a core; refresh depth through the draft

The retention goal is to move toward **roughly 15 players per team**, with the
main core staying together and much of the depth turning over through the
draft. This is an intended outcome, not a requirement to keep starters or
release reserves. There is no numeric keeper maximum.

The proposed salary cap is **$100 million per team**. The updated salary curve
and this cap will be tested together before rollout against the retention goal.
Expensive stars still force choices; affordable contracts allow more depth.

A team keeping 15 of 23 players has eight openings before UFA and the draft.
Established-player movement would primarily come through trades and mandatory
UFA. The draft replenishes depth, prospects, and future value. Drafted players
receive their initial season cap-free and need a contract to return for a later
season.

### Picks and roster openings

Keepers consume a team's latest available original picks first. Acquired picks
are preserved where roster capacity permits, and the app shows usable selections
before the draft. Full teams stop selecting. Teams short of selections receive
end-of-draft fill picks so they can complete their rosters. The draft supports
up to 23 regular rounds.

A team whose remaining slots are temporarily reserved by UFA offers is skipped
without pausing the draft or permanently losing its chance to fill the roster.
If offers lose, it uses remaining usable selections or receives end-of-draft
fill picks. Temporarily skipped picks, including acquired picks, are not
forfeited merely because an offer reserved the available space. The app shows
which selections remain usable and resolves them before awarding fill picks.

When capacity returns, finish the current live pick, then restore skipped
picks in their original draft order before continuing the normal sequence.
Each restored pick receives the normal four-active-hour clock. After regular
drafting ends, the same process handles outstanding selections and fill picks.
The league calendar publishes a final fill-pick cutoff before the season.
If a UFA loss opens a slot after that cutoff, the draft does not reopen. The
team carries a legal vacancy and can fill it through ordinary waivers when
they reopen at season start.

Unsigned signing rights are unlimited, but signed players, drafted players,
and reserved UFA roster commitments cannot exceed **23** in total, accounting
for distinct reserved conditional drops. A signing or offer that would leave
a 24th player after its conditional drop is rejected. Before and during the
draft, the app must ensure each acquisition leaves enough slots to complete a
legal positional roster. Picks cannot consume slots reserved by binding offers.

### A slow online draft beginning August 1

The draft starts **August 1** in the GSHL App. It runs every day from **10 a.m.
to 10 p.m. Eastern**, with picks and the clock frozen overnight. Each owner
gets **four active hours per pick**; expiration triggers an automatic pick.
An earlier selection immediately passes the turn to the next team. Remaining
time on an unfinished pick carries into the next active day.

The app would show whose turn it is, the remaining time, and the overnight
pause, and notify owners when they are on the clock. This format would replace
the need to attend a single live draft while preserving pick trading and the
existing draft order and roster rules.

There are no NHL player game locks during this offseason draft. Trades execute
immediately, including trading the current pick to another owner who can then
select immediately. Pick ownership and submission must be checked together so
a traded pick cannot be used by its former owner. **Trading a pick preserves
its remaining clock**; the buyer does not receive a new four-hour window.

Auto-draft uses the owner's ranked queue first, skipping unavailable players
or selections that prevent a legal final roster. Without a valid queued choice,
it selects the highest-rated available player who allows a legal roster to be
completed. Owners can see the fallback ranking before the draft. Every pick
checks current ownership and reserved roster capacity again at execution.

The expected eight rounds mean 112 picks. At the full four hours each, that is
448 active hours, or about **38 draft days** at 12 active hours per day. Finishing
in two weeks would require picks to average about **1.5 active hours**. August 1
provides room for slower picks; a couple of weeks is an expectation, not a
guaranteed duration.

### Protect the 2027 Seven-Year Super Draft

The target is to begin the new era at the **2027 draft**. The Commissioner has
verified the protected returning class against the app's draft-class UI and
confirmed that its listed players are accurate. This verification was confirmed
on **October 16, 2026**; the earlier projection of roughly eight stars is no
longer an outstanding verification task. The UI's verified class is the
reference for the players protected for that draft.

Players already promised a return to that draft remain in it. Existing 2027
pick ownership and placement results stand. The verified class will be published
before offseason decisions. The new mandatory-UFA route applies to
second-contract expirations after the 2027 draft.

The event should receive class profiles, mock drafts, pick-trade coverage, and a
countdown. Its protected player class does not depend on the new app being ready.

### Move into the new salary system in 2028

The transition happens in two stages. Here, 2027 and 2028 refer to the years in
which the season ends and that offseason takes place.

| Stage                                      | Salary curve  | Cap and market                                                                                                    |
| ------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| End of the 2027 season and 2027 re-signing | Current curve | Elevated $32.5M cap                                                                                               |
| 2027 UFA and Super Draft                   | Current curve | $32.5M remains in effect; new UFA bidding and selection system launches; protected stars return through the draft |
| End of the 2028 season and 2028 re-signing | New curve     | Elevated $60M cap for retaining the roster                                                                        |
| 2028 UFA                                   | New curve     | Cap rises to $100M; one-time offers at 100%–150% of base                                                          |
| Following offseasons                       | New curve     | $100M cap; normal UFA offers at 110%–148.5% of base                                                               |

The new UFA bidding, scoring, and weighted-draw system is used in **2027, 2028,
and beyond**. The protected 2027 draft class stays outside that UFA market.
This UFA upgrade can launch independently before the full league relaunch.

At the **end of the 2028 re-signing period**, teams must stay within a **firm
$60 million cap**, with **no contract-count limit** beyond roster capacity.
Existing contracts and new re-signings both count toward the cap, with normal cap accounting for
buyouts and outgoing retained salary. This is the checkpoint before UFA opens,
not a limit measured before re-signing begins.

When the offseason moves into UFA, the cap rises to **$100 million**. Owners fill
out the rest of their contracted core through UFA. The $60 million checkpoint applies only to the 2028
transition.

For the **2028 offseason only**, UFA offers start at **100% of base salary** and
can reach **150% of base salary**, in steps of five percentage points of base.
A player with a $4 million base salary can receive offers from $4 million to
$6 million. The seven-day market, one-to-three-year terms, binding offers, and
cap reservations still apply. Existing signed salaries are not repriced.

The lower UFA entry price gives owners a way to build out their contracted core.
Roughly 15 contracts is the intended outcome, not a quota or guarantee that every
team can afford its preferred 15 players.

## The postseason and a second trophy race

### External moves stop when Cup contention ends

A team loses external add/drop access immediately when it misses the playoffs
at the end of the regular season or loses a Cup playoff matchup. This applies
even if the team still has placement games to play.

A valid binding claim submitted before elimination survives and resolves
normally, even if its award occurs afterward. Elimination blocks new claims;
it does not cancel existing commitments or their reservations.

Eliminated teams can continue main/reserve moves, with the same four-move
allowance per league matchup period. At the season-ending Monday-noon closeout:

1. Finalize the GSHL championship result.
2. Roll contracts and cap sheets into the next season, expiring contracts
   whose final covered season has ended.
3. Process eligible pending transactions immediately using the updated
   contract state and applicable roster, cap, and move rules. Dropping a
   now-expired contract does not create a buyout.
4. Freeze all teams' resulting main rosters together for the NHL playoff
   tournament.
5. Cancel every remaining pending in-season transaction and release its
   reservations. Nothing carries into the offseason queue.

This closeout overrides the normal rule that binding commitments remain queued
until they can execute. Eligible acquisitions processed before the freeze are
part of the resulting tournament roster if placed on the main roster; canceled
transactions have no effect. Contract rollover still occurs at this season-end
closeout, and the final GSHL matchup's earned performances do not change.

Offseason trading reopens when the NHL playoff tournament ends. There are no
offseason waiver or ordinary free-agent pickups; UFA is the offseason signing
route. **Main/reserve moves are unlimited throughout the offseason**, with no
four-move allowance. They change the team's current roster arrangement, not
the separate frozen tournament lineup or its scoring.

### Signing rights and re-signing through June 30

After the GSHL season ends, player ownership is managed as **signing rights**
separately from the frozen tournament lineup. A team may hold more than 23
signing rights; unsigned rights do not consume roster slots. Existing signed
contracts retain their salary obligations. This rights allowance does not
increase the eventual 23-player roster or remove salary-cap requirements.

The re-signing period runs during the NHL playoff tournament and ends on
**June 30 every year**. Trading reopens after the tournament ends, leaving time
before June 30 to trade signing rights for picks, trade and then sign a player,
or sign a player and trade the resulting contract. These are ordinary immediate
transactions. There is no special rights-trade queue or deferred trade-and-sign
feature. Eligibility and contract-cycle rules continue to apply.

All unsigned signing rights lapse at the end of **June 30**. On **July 1**, only
players under contract remain on team rosters, typically leaving room to build
out a core through UFA and fill the roster to 23 through the draft. All unsigned
players become eligible for **both UFA and the draft**, regardless of whether
they met the roster-day re-signing threshold. The sole exception is the
protected 2027 Super Draft class, which remains draft-only.

**UFA opens July 1** after the re-signing close completes. Draft selections
later join team rosters as cap-free players, so the contracts-only roster
description applies at July 1, before drafting begins.

The existing placement competition becomes the **Draft Placement Tournament**.
The Adam Brophy Award and its negative Ladder value move to the last-place
regular-season team.

### NHL playoff tournament

The frozen main rosters compete through the entire Stanley Cup Playoffs.
Reserves do not participate, and there are no tournament acquisitions or roster
moves. Every playoff statistic from the frozen players counts, with no
appearance maximum. Having players whose NHL teams advance is an intentional
advantage.

All 14 teams compete in the same ten categories using rotisserie scoring:

- First in a category earns 14 points, second 13, down to one point for last.
  Tied places split the points for those positions.
- Higher totals win counting categories and save percentage; lower GAA wins.
- Teams need four goalie appearances to qualify for GAA and save percentage.
  Teams below that minimum receive zero points in those two categories;
  qualified teams receive the usual points for their finishing positions.
  Goalie wins still count normally.
- Highest combined score wins. Overall ties are broken by most outright
  category wins, then most second-place finishes, then thirds, and so on.
  If still tied, teams share the title and split the $50 prize; each receives
  five Owner Ladder points.

The winner receives $50, a permanent trophy, five Owner Ladder points, and Cup
Parade recognition. The tournament does not affect GSHL standings, playoffs,
power ratings, or draft order.

## Contracts and the offseason market

### One clear contract window

Individual salaries are published **when the GSHL season ends**, with no
required advance preview. They are fixed for that offseason. One announced
re-signing window replaces the current multiple periods, runs during the NHL
playoffs, and closes at the end of **June 30 Eastern**. The app shows each
decision, its cap effect, and the deadline, with notices and reminders.

Every re-signing is **processed immediately and becomes binding at once**.
There is no editable commitment waiting for the deadline and no adjustment
period. The signing must satisfy eligibility, contract-cycle, salary-cap, and
other commitments at submission. An unsigned right is not itself a contract.

Existing signed contracts keep their agreed salaries. At the deadline, those
contracts continue, while all unsigned rights lapse and their players enter
the shared UFA/draft pool, except the protected 2027 draft-only class. There
are no automatic new contracts. Owners receive a final preview of releases.

The existing roster-day signing-eligibility rule is fixed: a player must have
spent **more than two-thirds of the GSHL regular season** on the signing team's
roster or on GSHL rosters across the league, measured by player-days. Reserve
days count. Eligibility history is tracked separately from the contract-cycle
counter, and a buyout does not erase it.
This threshold governs incumbent re-signing through June 30. It does not bar
an unsigned player from the open UFA market beginning July 1.

### A player's contract cycle

| Stage                                | Treatment                                                   |
| ------------------------------------ | ----------------------------------------------------------- |
| Drafted season                       | Cap-free                                                    |
| First contract                       | 100% of published base salary; one to three years           |
| Incumbent second contract            | 110% of updated base salary; one to three years             |
| Second contract expires              | Mandatory UFA, except for the protected 2027 class          |
| Signed through UFA                   | Contract one of a new two-contract cycle                    |
| Player redrafted after mandatory UFA | Normal cap-free drafted season, then a fresh contract cycle |

Trades carry the existing term and contract history with the player. They do
not reset the cycle. Signed salaries remain fixed for the contract term.

### Contract years and season cap sheets

Contracts roll into the next year **when the GSHL championship matchup becomes
final**, at the league's Monday-noon finalization. Contracts completing their
last season expire then, leaving the applicable incumbent renewal (RFA) or
mandatory-UFA status. The protected 2027 draft exception still applies.

A new contract starts immediately when signed and ends at the conclusion of
the GSHL finals in its final covered season. For example, a three-year contract
signed after the 2028 finals covers the seasons ending in 2029, 2030, and 2031,
and expires at the end of the 2031 GSHL finals.

Each season has its own cap sheet and applicable cap. Signings and live UFA
offers charge every covered season; an expired contract no longer charges the
new season. Re-signing a player does not double-charge the old contract and its
replacement. Retention obligations and slots end at the original contract's
expiry. Buyouts retain their stated duration, recorded against the affected
season cap sheets rather than an ambiguous rolling calendar year.

The former owner may bid in mandatory UFA but has no matching right or incumbent
preference. The protection against indefinite ownership is the genuine
offseason market opportunity; an unsigned player is allowed to return through
the draft without a contract.

### Seven days of public UFA offers

The special 2028 transition uses the 100%–150% range described above. After 2028,
the normal **110%–148.5% of base salary** range applies as described below.
The same normal range applies in 2027, using the current salary curve.

The first offer opens **one seven-day clock for that player**. Later offers do
not extend it. Salary and term are public. The app shows the deadline and
notifies interested owners before closing.

The nominal UFA minimum is **110% of base salary**. Offers increase in steps of
**5% of that nominal minimum**, up to **135% of the nominal minimum**, equivalent
to **148.5% of base salary before rounding**. Each final annual offer is rounded
to the nearest **$50,000**. A player valued at $4 million receives offers from
**$4.4 million to $5.95 million per season**. Terms remain one to three years.

Base salaries and renewal salaries also round to the nearest $50,000, with
half increments rounded upward. Calculate each renewal or UFA target from the
rounded base and its nominal multiplier, then round the final salary. Do not
compound UFA steps from an already-rounded minimum. Existing signed salaries
remain fixed. Retained shares and buyouts use exact percentages of the signed
salary; they are cap allocations, not separately rounded new salaries.

Offers are binding and reserve cap room and roster capacity immediately. Neither
salary nor term can decrease, and offers cannot be withdrawn. A team must be
able to honor every live offer, including commitments in each covered season.

**The first offer is already a commitment when the second is made.** Every
later offer, increase, signing, draft pick, or accepted trade must fit assuming
all earlier agreements succeed, regardless of their odds. This check is atomic:
two simultaneous submissions cannot both spend the same remaining capacity.
An owner cannot count on an earlier conditional buyout freeing salary, either:
if that offer loses, the retained player's full salary still has to fit. The
app reserves enough resources for every possible combination of outcomes.

A team may attach a **distinct conditional drop** to a UFA offer, including
when its roster is full. That player is reserved and stays owned until the
offer wins. Winning executes the signing and drop together; losing keeps the
existing player and releases the reservation. A contracted drop triggers the
normal buyout, included in cap checks for every affected season before the
offer is accepted. Multiple offers cannot reuse the same drop or otherwise
depend on losing another offer to be legal.

Dropping a contracted player is a buyout, including during offseason UFA.
Moving that player between the main roster and reserves is not a drop or a
buyout; those offseason tier moves are unlimited and do not change the salary.
An offseason buyout release has a **48-hour waiting period** before the player
can enter UFA or the draft under the normal first-valid-action rule. If the
final opening-offer deadline has passed, only an available draft opportunity
or regular waivers after reopening can provide a route back onto a team.
Existing buyout charges and reacquisition restrictions still apply.

Salary and term dominate the UFA score:

| UFA factor                | Weight |
| ------------------------- | -----: |
| Offered salary            |    45% |
| Contract term             |    25% |
| Roster fit                |    20% |
| Previous team performance |     5% |
| Owner Ladder              |     3% |
| Draft capital             |     2% |

Each factor is normalized from zero to one. Salary scores zero at the minimum
and one at the maximum:
`(offer - rounded minimum) / (rounded maximum - rounded minimum)`.
Terms of one, two,
and three years score zero, 0.5, and one respectively. Multiply each factor by
its weight and add the results to obtain the offer's score.

For the special 2028 market, use the same formula with the rounded 100% and
150% base-salary endpoints. This keeps both endpoints at zero and one after
$50,000 rounding. All factor weights and the shared draw calculation remain
the same.

Roster fit keeps the current player-specific blend of teammate quality and
opportunity. If `p` is the player's rating percentile among positional peers,
the blend is `(0.35 + 0.30 × p) × quality + (0.65 - 0.30 × p) × opportunity`.
Elite players therefore put more emphasis on strong teammates; lower-rated
players put more on opportunity. Opportunity must measure improvement to the
best legal main roster, replacing the current model's simple count of
contracted players at the same position.

Salary and term account for 70% of the score. Previous performance, Ladder, and
draft capital together account for only 10%, keeping their advantage modest.
The app shows understandable probability bands. The highest offer is not
guaranteed to win.

A sole valid bidder signs the player automatically. Multiple bidders enter one
weighted draw at closing. The winning contract begins automatically and losing
teams immediately recover reserved capacity. Offers and the result remain
auditable.

UFA runs from **July 1 until the start of the next season**. The **August 1**
slow draft takes place during UFA; owners can draft and sign free agents at
the same time. There is no pre-draft UFA shutdown or universal pre-draft release
of offer reservations. Draft picks and UFA offers share the same 23-player
capacity checks, so a pick cannot spend a slot already reserved by an offer.

For a player eligible for both routes, the **first valid action determines the
route**. Opening a UFA market immediately removes the player from draft
availability while offers are active. Drafting the player immediately removes
them from UFA availability. The app checks and reserves player availability
atomically, including for automatic picks, so simultaneous actions cannot
create two owners. The protected 2027 class remains draft-only; otherwise all
unsigned players are eligible for either route, including players who missed
the roster-day re-signing threshold.

Opening an offer to remove a player from the draft pool is allowed, but the
offer remains binding. If nobody else bids, its owner must sign the player at
the offered salary and term. Owners must weigh that commitment against the
benefit of denying draft access.

The league calendar publishes the exact season-opening timestamp. Opening
offers stop **seven days before that instant**, and all existing markets must
finish by season opening. At that point, eligible unowned players move to the
ordinary daily noon waiver system. The draft's end does not create an offseason
ordinary-pickup window; undrafted unsigned players remain available through UFA
until its closing cutoff.

The summer provides time for successive seven-day markets.
These are not mandatory synchronized rounds:
owners choose which players to pursue and when to commit their available cap.
Losing an early draw frees room for another target. Managing that opportunity
cost is intentional; there are no backup bids or guaranteed replacement
signings for an owner who loses a late market near the start of the season.

### One probability calculation for UFA and claims

Both systems use the same draw method with their respective scores. **10% of
the probability pool is shared equally** among valid bidders; the other 90%
follows their weighted scores. This replaces the current five-percentage-point
minimum for every bidder, which would allocate 70% of a 14-team draw equally.

For `n` valid bidders and scores between zero and one:

```text
weight = exp(3 × score)
probability = 0.10 / n + 0.90 × weight / sum(all bidder weights)
```

A sole valid bidder wins automatically. Equal scores produce equal chances.
For example, with two UFA bidders whose other factors are identical, maximum
salary and three years versus minimum salary and one year produces odds of
about **85.2% to 14.8%**. Stronger offers matter without eliminating uncertainty.

Roster calculations use all owned players, including reserves, and find the
strongest legal 15-player main roster. Player values are frozen rating
percentiles from zero to one; an empty slot is zero. Roster quality is the sum
of those 15 slot values divided by 15, and weakness is one minus quality.
Improvement is the increase in that sum after adding the target and applying
the proposed drop, floored at zero. Because only one player is added, the
increase is at most one; it is also the opportunity score. Dropping a useful
player at another position can cancel the apparent gain.

These scores do not rescale when another bidder joins. Closing-time ownership
determines fit; pending offers reserve resources but do not count as already
owned players for odds. The [worked examples](gshl-relaunch-acceptance.md)
specify rating snapshots, ties, the remaining factors, and reproducible draws.

## Salary curve, cap, retention, and buyouts

### Price a deeper player pool

The proposed base-salary curve pays ranks 1–3 $10 million, then uses a declining cubic curve through
these starting targets, with salaries rounded to $50,000:

| Rank in the salary model | Annual base salary |
| -----------------------: | -----------------: |
|                      1–3 |        $10 million |
|                       20 |      $9.25 million |
|                      160 |      $5.75 million |
|                      325 |       $2.5 million |
|            400 and later |         $1 million |

The [salary analysis](gshl-relaunch-salary-analysis.md) compares this lifted curve
with the current schedule and previous proposal. Splitting the top 210 players
across 14 teams of 15 produces base payrolls of **$105.65–$106.05 million**,
averaging **$105.83 million**, within the target of **$104–$108 million**.
That is up from $97.43 million under the previous proposal. The teams are
approximately balanced by rank; equal underlying talent still needs testing.

The $100 million cap is about $6 million below that 15-player base average.
That pressure is intentional: owners should not automatically afford the best
possible 15-player core. Finding useful $1M, $2M, or $2.5M players creates room
for stars and rewards good roster decisions. Roughly 15 contracts is an outcome,
not a guarantee of retaining the top 15 available players or a fixed keeper
count. The cap and curve must be tested against actual
ratings, realistic keeper choices, existing contracts, UFA premiums, and cap
obligations to understand the tradeoffs, not to remove the intended scarcity.

Contracted main-roster and reserve players, buyouts, and outgoing retained
salary count against the cap. Live UFA offers reserve room. Newly drafted
players remain cap-free during their initial season.

### Salary retention in trades

A seller may retain **10% to 50%** of a contract in 10% increments for its
remaining term. Each contract can be retained only once; each team can carry
at most two outgoing retention obligations. Both cap sheets and the trade
offer show the split.

The retaining franchise cannot reacquire the player through any route until its
retention obligation expires. If the player moves again, the original seller's
obligation remains. Its retention slot becomes available at the original expiry.

### Buyouts and a fresh contract cycle

Dropping a contracted player creates a buyout charge of **50% of salary**,
effective immediately through the later of the original contract expiry or the
end of the following GSHL season. The app shows the charge schedule before
confirmation.

A buyout breaks the contract streak. The player becomes available without a
contract and can begin a fresh two-contract cycle, but accumulated roster-day
eligibility history remains. The new owner can offer a first contract in the
offseason window if the player is eligible.

The dropping franchise cannot reacquire the player through claims, free agency,
or trades until the original contract would have expired. Deliberate
arrangements to return a player and circumvent that restriction are prohibited.
Buyout charges remain with the dropping team.

For a retained contract, the seller keeps its original obligation and the buyer
buys out its own share. On a $5 million contract with 40% retained, the seller
continues paying **$2 million through the original expiry**. If the buyer drops
the player, its buyout is **$1.5 million**, half its $3 million share, for the
normal buyout duration.

## League rhythm and owner expectations

The year has clear moments: Cup Parade, contract decisions, UFA, the draft,
the trade deadline, the GSHL playoffs, and the NHL playoff tournament.

The app would prepare two short weekly WhatsApp posts for a human to review
and share:

- **Monday Aftermath:** results, upsets, close finishes, standings movement,
  and one funny superlative.
- **Thursday Stakes:** rivalries, playoff stakes, performances near the
  best-ball cut, trade activity, and one prediction prompt.

Long Press Box editions would be reserved for preseason, the trade deadline,
and the two playoff competitions. Push notifications would focus on actions:
claims, contracts, UFA, trades, roster deadlines, draft turns, and invalid
rosters. The Cup Parade remains an excuse to gather, with about 20 minutes at
most for structured awards and comedy.

Owners are expected to maintain legal rosters, acknowledge trade inquiries
within 72 hours and complete offseason decisions on time. During the slow
online draft, they make selections within the published pick clock. They must respond to Commissioner contact
and resolve illegal roster or cap states by a published deadline. Legal
vacancies, injuries, and quiet participation are not violations. Prolonged
disengagement calls for a private ownership conversation.
If an owner ignores a required roster or cap correction, the Commissioner
fixes the issue at their discretion.

GM of the Year and Coach of the Year remain. Award criteria will be handled
during implementation.

## Dues and prizes

The buy-in is **$50 per owner**, for **$700 across 14 teams**.

| Use                             |   Amount |
| ------------------------------- | -------: |
| GSHL Cup champion               |     $500 |
| GSHL Cup runner-up              |     $100 |
| NHL playoff tournament champion |      $50 |
| League fees                     |      $50 |
| **Total**                       | **$700** |

League fees would not be tracked against owners individually. The Commissioner
absorbs costs beyond the allocation; advertised prizes remain fixed.

## Launch when the full league can run reliably

The desired launch is the **2027 draft**, but readiness takes priority over a
fixed date. Optional editorial features can wait. Roster, acquisition, trade,
contract, draft, and scoring workflows must work together first.

Before launch, the league would:

1. Replay historical matchups and validate appearance limits, positional
   effects, goalie treatment, and selection transparency.
2. Validate the selected $100 million cap and salary curve against the goal of
   roughly 15 keepers using expensive and rebuilding rosters.
3. Preserve the protected 2027 player class already verified by the Commissioner
   in the draft-class UI. Check contract, eligibility, and pick migration accuracy
   during implementation before owners make commitments.
4. Test complete owner transactions, a full matchup, and pre-finalization
   corrections before collecting the launch-season buy-in.
5. Publish the rules, calendar, salary list, eligibility, and worked examples
   with time for owners to prepare. Introduce changes at an offseason boundary.

If the app is unavailable at a deadline, owners can submit requests through a
designated, timestamped WhatsApp fallback **before the normal deadline**. The
Commissioner enters valid requests using their original submission times.
Existing rosters carry forward automatically; retrospective requests are not
accepted. Short delays and occasional outages can be handled pragmatically by
the Commissioner; this 14-owner league does not need a complex recovery process.

Implementation must verify NHL-first data ingestion, season-long positional
locks, the agreed best-ball comparison, and immediate transactions with
player-specific game locks. The numerical specification and offline scenario
checks are recorded in the [acceptance report](gshl-relaunch-acceptance.md).
The running app must pass those same scenarios after integration; passing the
offline model does not establish that the live workflows implement the proposal.
Queue execution and reservations must be tested together. These details must
follow the agreed rules and cannot reopen completed-matchup results or introduce
daily lineup work.

The Commissioner will discuss the package with owners and make the final
adoption decision. If readiness delays the full relaunch, the protected 2027
draft commitments still stand.

## How we will know whether it worked

After the first season, review completed trades and how broadly trade activity
was spread across owners. Ask whether owners spent less time maintaining
lineups and more time discussing players, teams, and potential deals.

More transactions alone would not establish success. The league should feel
easier to maintain and more worthwhile to participate in. Owner feedback and
trade participation will guide adjustments; chat volume will never earn a
competitive advantage or become a participation requirement.
