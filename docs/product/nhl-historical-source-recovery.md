# Historical NHL source recovery

The historical backfill covers the regular seasons from 2008–09 through
2012–13. Their canonical season records carry `nhlOnly: true`: they support NHL
statistics and contract analysis without creating GSHL schedules or rosters.
Official NHL season reports supply the complete player population and totals.
Historical identity provisioning requires official NHL IDs, birth dates and
positions; newly created historical players are inactive.

The reviewed hockey method remains fixed by
[the production policy](nhl-hockey-overall-production-policy.md). Source recovery
does not change the shot features, whole-game folds, learner, impact model,
replacement references or qualification gates.

For older feeds that omit shot metadata or events, an explicitly collected
supplement may recover raw details from the
[MoneyPuck historical shot archive](https://moneypuck.com/data.htm). Credit:
MoneyPuck.com. The supplement must independently match official NHL game reports
by game, period, time, event kind, team and rostered player. Ambiguous matches
remain rejected. Added missed-shot events require an exact official report
match. Official event order supplies the existing model's previous-event
context. Provider probabilities, expected goals and other model-derived values
must never enter training or player valuation.

Recovering entirely absent on-goal events requires an explicit game-specific
source class and full conservation against an independent official boxscore:
both teams and every skater's and goalie's shots and goals must reconcile.
Record added report-derived identities separately from the original native
events, and retain their complete source lineage.

Keep the original NHL payloads, archive and official HTML reports immutable.
Bind derived supplements to their exact source hashes and validate them again
when loading. Native metadata conflicts require explicit source evidence;
missing data never becomes a neutral estimate. A corrected empty-net event
requires official lineup evidence rather than inferring an empty net from the
absence of a goalie ID.

Valid official native shot coordinates remain authoritative when the raw
archive differs. Record that disagreement in the derived audit; use the
archive to fill missing coordinates only. Team bench penalties identify the
player serving the penalty separately from an individual offender.

Historical report names may resolve through documented, exact NHL-ID-specific
name variants. The team, jersey, first name and unique roster identity must
still agree. Similar names alone never establish an identity.

When an official penalty-shot sequence contains an additional shot record with
unresolved context, retain that record in the official shot workload and leave
its value unknown. An independently verified terminal penalty shot can receive
the existing penalty-shot prior once. Neither an invented ordinary-shot chance
nor a zero-value bookkeeping shot can resolve ambiguous source evidence.

A saved penalty shot entirely absent from native play-by-play requires a
separate, explicitly scoped proof. Match the official terminal attempt, award,
isolated shooter and goalie, and following faceoff; reconcile every player's
shots and goals and both teams' totals. Use a distinct report-derived event
identity and the existing penalty-shot prior, with no invented coordinates or
ordinary-shot probability. Any extra discrepancy invalidates the reconstruction.

A fully downloaded shift report can still be unusable. A separately reviewed,
versioned availability proof must bind the original reports, API shift
responses, schedule, played roster and parser bytes, then reproduce the exact
failure on every load. Preserve any independently verified side's intervals.
Unusable intervals remain unknown and contribute no verified process exposure;
this does not assign zero hockey contribution. Keep every official game,
appearance, second and recorded attempt in the coverage denominators, and
verify individual event credit separately. Audit downloaded components and
verified components separately. Missing downloads, changed bodies, unexpected
errors or newly available valid shifts invalidate the proof. This is an
explicit source availability contract, not a generic exception fallback.
Cache proof identities include both the parser binding and the effective
play-by-play hash, so a newly verified supplement requires its own review and
cannot overwrite or silently reuse an earlier source interpretation.

Reviewed adjacent-period clock repairs require the exact original rows and
player identities, every period's ice-time total, strength-time sums and the
native game total to reconcile uniquely. Preserve the unaffected side's original
intervals. A damaged goalie row requires independent continuous-period evidence;
unresolved one-second discrepancies remain unavailable. Retain the original
reports and replay the hash-bound reconciliation whenever the proof is loaded.

A truncated overtime feed can also understate elapsed game time. A final official
scoring summary may establish the ending clock only after game, date, final
scores and the unique overtime winner reconcile. This extends the unknown
exposure denominator without inventing a goal event, geometry or contribution.

Canonical official skater goal totals must reconcile against verified individual
goal credit. An entirely missing event can evade a play-by-play-only gap count;
the larger of the existing gap and official goal deficit controls qualification.
Do not count the same missing goal twice. Overcredited or invalid official totals
fail closed. Publication independently replays the retained physical sources and
checks that goal deficits remain unqualified in both model arms.

Individual shot coverage also uses independent official skater SOG and goalie
shots-against totals. Entirely absent on-goal attempts enlarge the exposure
denominator while known missed shots remain counted; they never create value.
The whole-season shot gate applies the same independent skater SOG lower bound,
counting unattributed native shots once. Unreviewed on-goal credit above the
official total fails validation. A narrowly scoped primary-report certificate
may establish that a whole physical attempt group has an unresolved final
SOG-versus-miss classification. It must preserve all attempt and goal identities,
verify every group member against the retained primary report, and bind fresh
official player-game totals. The certificate does not select an unknown attempt
or change a label. Reviewed excess enters both the upper bound and the missing
exposure floor, so it cannot cancel an unrelated missing attempt. Goalie shots
taken remain in physical exposure but do not inflate the skater SOG comparison.
Preparation, valuation and fresh publication replay use identical aggregate
coverage and source gates. The existing coverage thresholds stay fixed.

Training support must account for every completed official game, including a
game with no verified ordinary-shot training rows. Bind its exact schedule,
source hashes, row counts and physical audit in a per-game ledger. An explicitly
audited empty training set contributes no examples or labels; its official
workload and source gaps remain in the season coverage checks. Missing games or
unexplained row omissions must still fail before fitting.

Each season must pass the unchanged complete-download, exposure, shot,
finishing/saving and native inference checks. Unsupported players remain
provisional. Correcting a training event requires rebuilding its season's
cross-fitted shot and impact models; changing a qualification flag alone is
insufficient. Existing published snapshots require a separately reviewed,
backed-up update before their replacement.

Contract normalization uses the actual completed regular-season schedule,
including the 48-game 2012–13 season. Complete contract averages require a
qualified observed value for every completed contract year.

A separately reviewed event-source availability proof can identify exact games
or periods whose primary event report is empty or whose clocks cannot be
recovered. Bind the original native events, report bodies and provider archive;
never infer replacement clocks, shot geometry or event order. Preserve native
appearances, TOI, goals and shot exposure. Withheld periods supply no shot-model
training, individual shot value or verified process time; known native penalty
records remain available for their existing independent checks. This is separate
from shift-source availability and cannot create a qualified zero contribution.
