# GSHL Relaunch

[Project overview](../../README.md) ·
[Current rulebook](../../src/content/rulebook.ts) ·
[Salary analysis](gshl-relaunch-salary-analysis.md)

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

GSHL would keep its 14 franchises, two seven-team conferences, head-to-head
categories, home-ice tiebreaker, Cup and playoff structure, Owner Ladder, and
long-term team identities. The draft could remain a live, informal event or
move to a slow online format that owners participate in over multiple days.

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
the games included in the **45 skater appearances** and up to **four goalie
appearances**. Other matchup lengths use their normal scaled allowances.

Automatic best-ball remains the default for owners who make no changes. An
owner could choose a lower-rated game because its production better suits the
category matchup. The table would show which selections are manual and let the
owner return to automatic selection.

Overrides change only which whole performances count. They cannot include
reserve-only or otherwise ineligible games, count a performance twice, or
exceed overall or positional limits. They do not move players between roster
tiers or consume acquisition or reserve moves. Manual selections stay editable
until the matchup is finalized, independently of the daily roster transaction
deadline. Finalized matchup results remain locked; there is no additional
editing window after the final statistics are processed.

Goalie selection must still count available
appearances up to the maximum rather than discard poor games to protect ratios.
For example, with five eligible goalie games and a four-game maximum, an owner
can choose which four count; with only three eligible games, all three count.
Implementation must make clear how newly completed games interact with manual
selections so owners know which choices the app will preserve.

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

| NHL game days | All skaters | C max | LW max | RW max | D max | G range |
| ------------: | ----------: | ----: | -----: | -----: | ----: | ------: |
|             6 |          39 |    12 |     10 |     10 |    15 |     2–4 |
|             7 |          45 |    14 |     12 |     12 |    18 |     2–4 |
|            10 |          65 |    20 |     17 |     17 |    26 |     2–6 |
|            14 |          91 |    28 |     24 |     24 |    36 |     2–8 |

For `N` NHL game days, the overall skater limit is `floor(6.5 × N)`, centers
`2 × N`, each wing `round(12 × N ÷ 7)`, and defense `round(18 × N ÷ 7)`.
Positional ceilings are not guaranteed allocations and do not add up to the
overall ceiling.

The goalie minimum is **always two**. The maximum is
`max(4, round(4 × N ÷ 7))`: it grows for longer matchups but never falls below
four. Relief appearances count. The app counts available appearances up to the
maximum; it cannot keep only two excellent games to protect ratios. Above the
maximum, automatic selection uses the highest-rated complete performances;
owners may override that selection under the rules above. GAA and save
percentage use combined underlying totals, not averages of game percentages.

A team below two appearances concedes all three goalie categories. If both
teams miss the minimum, those categories tie.

### Completed results stay final

A matchup becomes final when every included NHL game has ended and its required
statistics have been received and processed. The app displays **awaiting final
stats** during a data delay. Once complete, later corrections do not change the
matchup result.

Counted performances determine GSHL category totals and production-based awards.
Every eligible performance is also retained to explain selections and support
analysis. The underlying NHL talent model continues to use NHL performance
independently of which games GSHL selected.

## Weekly management and the daily deadline

Each team receives **two external acquisitions and four reserve moves per
matchup**. These allowances do not increase for longer matchups. Unused moves
expire.

A normal reserve swap exchanges one player in each direction and uses one move.
Demoting an injured player and later bringing them back uses two. The app handles
movement between eligible main-roster positions automatically.

Transactions process at **3 p.m. Eastern or 30 minutes before the day's first
NHL game, whichever is earlier**. A 1 p.m. first game means a 12:30 p.m.
deadline; a 7 p.m. first game means 3 p.m. On days without games, use 3 p.m.

If the NHL schedule changes on the day of a game, the deadline becomes immediate
when that change is detected. Transactions already processed remain in effect.

The app shows the next deadline. Reserve moves, acquisition awards, and accepted
trades take effect at that processing time. Submissions after the deadline wait
for the next day's processing. Already-earned performances stay with the team
that owned the player when the game locked.

Due decisions enter one queue and execute one at a time. There is no preferred
order among claims, signings, trades, and roster moves. The app records the
actual execution order and preserves existing reservations and transaction
requirements as each decision completes.

## Trading should be the main way to improve a team

Trades **do not consume the two-acquisition allowance**. Owners can negotiate
through WhatsApp or direct messages, then send a formal app offer showing
players, picks, contracts, retained salary, cap effects, and required roster moves.

Acceptance makes the agreement binding and immediately reserves the players,
picks, cap room, roster capacity, and required reserve moves needed to complete
the trade. Acceptance must satisfy roster, position, and cap rules, including
existing reservations. Later actions cannot spend or commit those reserved
resources or invalidate the accepted trade. The complete exchange executes
together at the next daily processing time.
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
daily processing time after that period. Other unowned free agents are available
through daily claims rather than immediate first-click acquisitions.

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

Reservations count against the matchup in which the award is scheduled to
process. Losing releases the reservation; winning executes the acquisition
automatically. A free agent can enter either tier by replacing a player in that
tier or filling a legal vacancy. Dropping a contracted player triggers a buyout.

Displayed odds are provisional until closing. Final odds use the roster at
closing, and the app retains the inputs and draw result so the award can be
explained.

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

### Option: a slow online draft

Instead of requiring everyone to attend one event, the draft could run in the
GSHL App over multiple days. Each owner would have **roughly six hours of active
draft time per pick**, with the draft and its clock paused overnight. An owner
can pick sooner, immediately passing the turn to the next team during active
hours. Unused time on the current pick carries into the next active day.

The app would show whose turn it is, the remaining time, and the overnight
pause, and notify owners when they are on the clock. This format would replace
the need to attend a single live draft while preserving pick trading and the
existing draft order and roster rules.

Before choosing this format, publish the daily active hours in Eastern time,
the rule for an expired pick clock, and a calendar with enough time to finish
before the season. Six hours is a maximum, not an expected pace: 14 teams making
eight picks each would allow **672 active hours** if every pick used the full
clock, so the draft could take weeks rather than days. Its start date and
preceding contract and UFA deadlines must account for that possibility.

The live format remains an option, with remote/proxy participation, early
scheduling, food, predictions, and an informal pace.

### Protect the 2027 Seven-Year Super Draft

The target is to begin the new era at the **2027 draft**. The Commissioner's
projection is that roughly eight top NHL players will complete their initial
season and two contracts together, seven seasons after the keeper system began.
The exact class must still be verified against the contract ledger.

Players already promised a return to that draft remain in it. Existing 2027
pick ownership and placement results stand. The verified class will be published
before offseason decisions. The new mandatory-UFA route applies to
second-contract expirations after the 2027 draft.

The event should receive class profiles, mock drafts, pick-trade coverage, and a
countdown. Its protected player class does not depend on the new app being ready.

### Move into the new salary system in 2028

The transition happens in two stages. The **2027 draft redistributes the top
talent** returning to the pool. The **2028 re-signing window introduces the new
salary curve**, followed by an offseason market intended to help teams build
toward roughly 15 contracts under the **$100 million cap**.

At the **end of the 2028 re-signing period**, teams must stay within a **firm
$40 million cap**, with **no contract-count limit** beyond roster capacity.
Existing contracts and new re-signings both count toward the cap, with normal cap accounting for
buyouts and outgoing retained salary. This is the checkpoint before UFA opens,
not a limit measured before re-signing begins.

When the offseason moves into UFA, the cap rises to **$100 million**. Owners fill
out the rest of their contracted core through UFA. The $40 million checkpoint applies only to the 2028
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

Eliminated teams can continue main/reserve moves, with the same four-move
allowance per league matchup period. When the GSHL championship matchup
completes, **all teams' main rosters freeze together** for the NHL playoff
tournament.

Offseason trading reopens when the NHL playoff tournament ends. This does not
reopen external add/drop access or change the completed tournament's rosters
or results.

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

Final cap rules, the salary curve, individual salaries, and signing eligibility
will be published **at least 30 days before the contract deadline** and frozen
for that offseason. One announced offseason contract window replaces the
current multiple signing periods. The app shows each decision, its cap effect,
and the deadline, with public notices and private reminders.

Existing signed contracts keep their agreed salaries. At the deadline, those
contracts continue, while unsigned players are released: contract-eligible
players enter UFA, and ineligible players enter the draft pool. There are no
automatic new contracts. Owners receive a final preview of releases.

The existing roster-day signing-eligibility rule is fixed: a player must have
spent **more than two-thirds of the GSHL regular season** on the signing team's
roster or on GSHL rosters across the league, measured by player-days. Reserve
days count. Eligibility history is tracked separately from the contract-cycle
counter, and a buyout does not erase it.

### A player's contract cycle

| Stage                                   | Treatment                                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| Drafted season                          | Cap-free                                                                               |
| First contract                          | 100% of published base salary; one to three years                                      |
| Incumbent second contract               | 110% of updated base salary; one to three years                                        |
| Second contract expires                 | Mandatory UFA, except for the protected 2027 class                                     |
| Signed through UFA                      | Contract one of a new two-contract cycle                                               |
| Mandatory UFA unsigned before the draft | Returns to the draft pool; normal cap-free drafted season, then a fresh contract cycle |

Trades carry the existing term and contract history with the player. They do
not reset the cycle. Signed salaries remain fixed for the contract term.

The former owner may bid in mandatory UFA but has no matching right or incumbent
preference. The protection against indefinite ownership is the genuine
offseason market opportunity; an unsigned player is allowed to return through
the draft without a contract.

### Seven days of public UFA offers

The special 2028 transition uses the 100%–150% range described above. After 2028,
the normal **110%–148.5% of base salary** range applies as described below.

The first offer opens **one seven-day clock for that player**. Later offers do
not extend it. Salary and term are public. The app shows the deadline and
notifies interested owners before closing.

The UFA minimum is **110% of base salary**. Offers increase in steps of **5% of
that minimum**, up to **135% of the minimum**, equivalent to **148.5% of base
salary**. A player valued at $4 million receives offers from **$4.4 million to
$5.94 million per season**. Terms remain one to three years.

Offers are binding and reserve cap room and roster capacity immediately. Neither
salary nor term can decrease, and offers cannot be withdrawn. A team must be
able to honor every live offer, including commitments in each covered season.

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
and one at the maximum: `(offer / UFA minimum - 1) / 0.35`. Terms of one, two,
and three years score zero, 0.5, and one respectively. Multiply each factor by
its weight and add the results to obtain the offer's score.

For the special 2028 market, the salary score is instead
`(offer / base salary - 1) / 0.50`: zero at 100% and one at 150% of base.
All factor weights and the shared probability calculation remain the same.

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

UFA closes **at least 48 hours before the draft**. Opening offers stop seven days
before that closing time, allowing every market to finish. The final draft pool
is published after offers resolve and reservations are released. Unsigned
mandatory UFAs join that pool.

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

The weights and draw method are settled. The precise normalization of
main-roster improvement and roster weakness will be specified and tested during
implementation, accounting for positional constraints and proposed drops.

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

The $100 million cap is about $6 million below that 15-player base average,
so owners will need to make choices about which players to retain. This does
not establish a fixed keeper count. The cap and curve must be tested against actual
ratings, realistic keeper choices, existing contracts, UFA premiums, and cap
obligations. The goal is a retained core approaching 15 players, rather than
preserving a particular cap number at the expense of that experience.

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
within 72 hours and complete offseason decisions on time. For a live draft,
owners attend or arrange remote/proxy participation; for a slow online draft,
they make selections within the published pick clock. They must respond to Commissioner contact
and resolve illegal roster or cap states by a published deadline. Legal
vacancies, injuries, and quiet participation are not violations. Prolonged
disengagement calls for a private ownership conversation.

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
3. Verify the protected 2027 player class, contracts, eligibility, and pick
   ownership before owners make commitments.
4. Rehearse complete owner transactions, a full matchup, data delays,
   pre-finalization corrections, and outage recovery before collecting the
   launch-season buy-in.
5. Publish the rules, calendar, salary list, eligibility, and worked examples
   with time for owners to prepare. Introduce changes at an offseason boundary.

If the app is unavailable at a deadline, owners can submit requests through a
designated, timestamped WhatsApp fallback **before the normal deadline**. The
Commissioner enters valid requests using their original submission times.
Existing rosters carry forward automatically; retrospective requests are not
accepted. This recovery process must be rehearsed without Yahoo as a backup.

Implementation must verify NHL-first data ingestion, season-long positional
locks, the agreed best-ball comparison, and immediate deadlines following
same-day schedule changes. It must also define and test normalization for claim
and UFA scores and a consistent fallback for otherwise identical selections.
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
