# NHL roster talent

The NHL Teams admin view compares current stored NHL rosters using the existing
cap-independent, age- and peer-adjusted annual GAR forecast. It selects up to
14 forwards, 8 defensemen and 2 goalies independently by projected GAR per 82 team
games, then adds their signed values. The breakdown shows position totals and
the selected players. Salary, contract term and normalized cap hit do not enter
selection or scoring. Search filters teams after the league ranking is computed.

This is a roster-depth index, not a validated prediction of team goal differential,
standings or wins. Individual annual projections include expected participation
and workload. Multiplying those values by another ice-time or lineup weight
would count workload twice. The sum does not impose a shared team minutes or
goalie-start budget, account for changes in roles after trades, or estimate
chemistry. A lineup-aware successor would need separately validated per-minute
ability and projected role/availability, allocated within a team workload budget;
it must be evaluated against the additive baseline before replacing it.

## Coverage

Every team with at least one modeled roster player receives a rank by its
available modeled subtotal. A short positional group is a partial roster; no
replacement player or zero is invented. The exact F/D/G counts and number of
unrated actual roster players are displayed separately. A subtotal is not a lower
bound: unobserved contributions could be positive or negative.

Unrated players remain outside selection. Even with all 24 slots modeled, an
unrated additional player could change the true best 24. Such teams are explicitly
provisional, as are teams using research-status player forecasts. Research status
is retained, not relabeled as qualified. An entirely unmodeled team has no score
or rank. The pure calculator also retains a separate full-24 score, null for a
short group. Ties share competition ranks, and canonical NHL identities prevent
counting one player twice across clubs.

Current projections and historical contribution have separate views. The current
forecast origin must match the selected current season. Historical rankings sum
verified GAR delivered in that season without forecasts or schedule extrapolation,
using each stat line's historical position and recorded club. A shortened season's
delivered GAR is not converted to a hypothetical 82-game contribution. Population
coverage and missing observations remain explicit and make rankings provisional.

Historical multi-club players have only aggregate season GAR in the current read
model. Their full GAR is never copied to either club or divided using guessed
shares. They appear as unallocated on every recorded club, and those rankings
remain provisional until verified stint contributions are available. The historical
view is therefore a recorded-contribution subtotal, not a complete team result
where allocations are missing.

Future signed commitments retain their salary view. Ratings refresh
reactively with stored player assignments. They do not refresh the source roster
or retrain the player forecast. No new scheduled task or production stat write
is introduced.
