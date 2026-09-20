# Regular-season schedule builder

Source: the schedule-hub conversation with the commissioner.

## Accepted requirements

- Provide a commissioner hub in the existing app, including schedule generation,
  balance reports, a downloadable draft, and publishing to the selected season.
- Accept the regular-season week count; 21 is usual but the count varies.
- Each of the 14 teams plays exactly one opponent each week.
- Each team plays the seven opponents in the other conference exactly once.
- All remaining games are within its conference, with at least two games against
  each of the six conference opponents.
- Favor historical equality in opponent meeting totals where the constraints
  allow extra games to be allocated.
- Make each owner pair's cumulative regular-season home/away counts as equal as
  possible. Playoff games do not count.
- Randomize the layout and try to avoid rematches in quick succession.
- Track history by **owner**, combining their franchises. Franchises always belong
  to one specific owner, as confirmed by the commissioner.

## Derived constraints and implementation decisions

- With seven teams per conference, the number of weeks must be odd and at least
  19. Each week needs at least one cross-conference game, so the 49 such games
  limit the season to 49 weeks.
- Historical matchup counts use earlier seasons and exclude playoff weeks,
  playoff game types, and games explicitly marked incomplete. Legacy regular
  season rows without a completion flag remain eligible.
- One cross-conference game per pair cannot repair existing differences in
  cumulative cross-conference meeting totals. Show these totals in the report.
- Historical home/away repair takes priority over equal seasonal home totals.
  Large inherited deficits can require several seasons to repair.
- Opponent-frequency allocation and rematch spacing use bounded heuristics, not
  a guarantee of a global optimum. A seed makes generated drafts reproducible.
- Allow whole weeks to be reordered without breaking weekly participation rules.
- Drafts are temporary until downloaded or published.
- Publishing requires exactly the requested number of existing regular-season
  weeks, with future start dates. Map draft positions to their week-number order.
- Publish through a commissioner-authorized atomic transaction, revalidating all
  hard matchup constraints. Reject existing regular-season schedules; preserve
  playoff matchups. This feature does not replace or repair existing schedules.

## Implementation task graph

1. Owner-history projection and deterministic schedule rules.
2. Generator, independent validator, fairness report, and focused tests (depends
   on 1).
3. Commissioner hub, draft export, and whole-week reordering (depends on 2).
4. Authorized publishing and transaction tests (depends on 1 and 2).
5. Integration verification and independent standards/spec reviews (depends on
   3 and 4).

No GitHub spec or ticket issues were supplied; the commissioner selected this
conversation as the specification. There are no issue-closing references.
