# Lineup accounting: MS, BS and MG

These analytical counters use the definitions confirmed by the commissioner on
2026-10-25. They apply consistently to every season and stat-line period.

- **MS — missed start:** a skater appeared in an NHL game while assigned to BN,
  IR or IR+, and could have filled an open fantasy starting slot. The lineup
  engine fills available slots with eligible played skaters while preserving
  actual played starters. Goalies do not receive MS.
- **BS — bad start:** an actual fantasy starter appeared in an NHL game but is
  on the bench in the best feasible lineup for that roster and date. This
  includes goalies. The benched player who would improve the lineup does not
  receive BS.
- **MG — missed game:** the player's NHL team completed an eligible regular
  season or playoff game, but the player did not appear. This applies to every
  fantasy slot, including bench and IR. Future, live, postponed and cancelled
  games do not count as completed games. Preseason and exhibitions do not count.

Daily counters are binary. Week, season and career counters sum the corresponding
daily flags across **all** roster slots. LT is included in postseason totals.
Use each season's roster settings and the player's recorded eligibility for that
date. The best lineup uses the lineup engine's rating objective; a different
slot assignment with an equal objective is not a different counting rule.

After NHL stats and daily ratings refresh, rebuild `fullPos` and `bestPos` before
deriving MS and BS. Preserve the manager's recorded `dailyPos` and `GS`. Inactive
players have neither MS nor BS, even if a hindsight slot is assigned to them.

## Historical repair

Capture canonical source rows and metadata, checksum each file, and reconcile
completed games against official NHL season schedules. Rebuild dated team
lineups, then sum flags into all eight aggregate tables. Reject unresolved
identities, incomplete source coverage and infeasible played starting slots.
Review the proposed patches and preserve an independently verified backup of
the source snapshot, official evidence and exact plan before applying.

The replay operator defaults to a complete preflight. Its Convex mutation checks
source preimages (excluding only the `updatedAt` audit timestamp) and permits
only MS/BS/MG, daily hindsight positions, and
source-proven corrections to dated NHL team labels.
It preserves ratings, native hockey stats and recorded fantasy decisions,
maintains the performance index transactionally, and refuses source conflicts.
Repeating a completed plan with `--verify` must report zero pending changes.
See [the operator reference](../../scripts/README.md#reviewed-lineup-accounting-replay).
