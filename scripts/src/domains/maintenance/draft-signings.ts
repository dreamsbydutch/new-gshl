export type DraftRepairRow = Record<string, unknown> & { id: string };
export type OpeningRoster = {
  seasonId: string;
  date: string;
  rows: Array<{ playerId: string; gshlTeamId: string }>;
};
export type DraftSigningSource = {
  seasons: DraftRepairRow[];
  teams: DraftRepairRow[];
  franchises: DraftRepairRow[];
  contracts: DraftRepairRow[];
  picks: DraftRepairRow[];
  players: DraftRepairRow[];
  openings: OpeningRoster[];
};
export type SigningChange = {
  kind: "fill" | "insert";
  id?: string;
  player: string;
  team: string;
  contractIds: string[];
  before?: DraftRepairRow;
  data: Record<string, unknown>;
};
export type SigningSeasonPlan = {
  seasonId: string;
  season: string;
  eligible: number;
  accounted: number;
  excluded: string[];
  issues: string[];
  notes: string[];
  changes: SigningChange[];
};

export function signingPickWriteData(
  change: SigningChange,
): Record<string, unknown> {
  return {
    ...change.data,
    // The compatibility writer clears an omitted legacyId on a patch.
    ...(change.before?.legacyId != null
      ? { legacyId: change.before.legacyId }
      : {}),
  };
}

const text = (value: unknown) => (value == null ? "" : String(value));
const date = (value: unknown) => {
  if (value instanceof Date || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime())
      ? parsed.toISOString().slice(0, 10)
      : "";
  }
  return /^\d{4}-\d{2}-\d{2}/.exec(text(value))?.[0] ?? "";
};
const positive = (value: unknown) =>
  Number.isInteger(Number(value)) && Number(value) > 0;

/** Infer the continuation from the last two complete rounds, including delayed snakes. */
export function inferDraftContinuation(
  picks: DraftRepairRow[],
  teamIds: string[],
) {
  const count = teamIds.length;
  if (!count || picks.some((p) => !positive(p.pick) || !positive(p.round))) {
    throw new Error("Draft order is not fully numbered");
  }
  const max = Math.max(...picks.map((p) => Number(p.pick)));
  if (new Set(picks.map((p) => Number(p.pick))).size !== picks.length) {
    throw new Error("Draft has duplicate overall pick numbers");
  }
  for (const pick of picks) {
    if (
      Math.floor((Number(pick.pick) - 1) / count) + 1 !==
      Number(pick.round)
    ) {
      throw new Error("Round and overall pick numbers disagree");
    }
  }
  const lastCompleteRound = Math.floor(max / count);
  function order(round: number) {
    const rows = picks
      .filter((p) => Number(p.round) === round)
      .sort((a, b) => Number(a.pick) - Number(b.pick));
    const ids = rows.map((p) =>
      text(p.originalTeamId || (!p.isTraded ? p.gshlTeamId : "")),
    );
    if (
      rows.length !== count ||
      new Set(ids).size !== count ||
      ids.some((id) => !teamIds.includes(id))
    ) {
      throw new Error(
        "Cannot identify every original team in the final complete rounds",
      );
    }
    return ids;
  }
  if (lastCompleteRound < 3)
    throw new Error("Too few completed rounds to establish snake direction");
  const anchor = order(lastCompleteRound);
  if (
    order(lastCompleteRound - 1)
      .reverse()
      .join() !== anchor.join()
  ) {
    throw new Error(
      "The final complete rounds do not establish a reversing snake",
    );
  }
  return (teamId: string, after: number) => {
    const slot = anchor.indexOf(teamId);
    if (slot < 0) throw new Error("Team has no snake slot");
    let round = Math.floor(after / count) + 1;
    for (;;) {
      const offset =
        (round - lastCompleteRound) % 2 === 0 ? slot : count - 1 - slot;
      const pick = (round - 1) * count + offset + 1;
      if (pick > after) return { round, pick };
      round++;
    }
  };
}

/** Plan additive repairs; filled selections, contracts, and rosters are never changed. */
export function planDraftSignings(
  source: DraftSigningSource,
  seasonIds?: string[],
): SigningSeasonPlan[] {
  const franchises = new Map(source.franchises.map((f) => [f.id, f]));
  const players = new Map(
    source.players.map((p) => [p.id, text(p.fullName) || p.id]),
  );
  return [...source.seasons]
    .sort((a, b) => Number(a.year) - Number(b.year))
    .filter((s) => !seasonIds || seasonIds.includes(s.id))
    .map((season) => {
      const plan: SigningSeasonPlan = {
        seasonId: season.id,
        season: text(season.name),
        eligible: 0,
        accounted: 0,
        excluded: [],
        issues: [],
        notes: [],
        changes: [],
      };
      const start = date(season.startDate);
      if (!start) {
        plan.issues.push("Season has no valid opening date");
        return plan;
      }
      const teams = source.teams.filter((t) => t.seasonId === season.id);
      const picks = source.picks.filter((p) => p.seasonId === season.id);
      const opening = source.openings.find((o) => o.seasonId === season.id);
      const candidates = new Map<string, DraftRepairRow[]>();
      for (const contract of source.contracts) {
        const from = date(contract.startDate),
          to = date(contract.expiryDate),
          signed = date(contract.signingDate);
        // Playing coverage ends at expiryDate, not at the end of a buyout's cap charge.
        if (!from || !to || !signed) {
          plan.issues.push(
            `Contract ${contract.id} lacks dated coverage; cannot infer its opening-season eligibility`,
          );
          continue;
        }
        if (from > start || to < start || signed > start) continue;
        const playerId = text(contract.playerId);
        candidates.set(playerId, [
          ...(candidates.get(playerId) ?? []),
          contract,
        ]);
      }
      if (!teams.length || !picks.length) {
        plan.notes.push(
          `No existing ${!teams.length ? "teams" : "draft"}; ${candidates.size} dated contract players cannot be assigned without a configured draft order`,
        );
        return plan;
      }
      const missing = new Map<
        string,
        Array<{ playerId: string; contracts: DraftRepairRow[] }>
      >();
      for (const [playerId, contracts] of [...candidates].sort(([a], [b]) =>
        (players.get(a) ?? a).localeCompare(players.get(b) ?? b),
      )) {
        const name = players.get(playerId);
        if (!name) {
          plan.issues.push(`Unknown contracted player ${playerId}`);
          continue;
        }
        const existing = picks.filter((p) => p.playerId === playerId);
        const rosterTeams = [
          ...new Set(
            opening?.rows
              .filter((r) => r.playerId === playerId)
              .map((r) => r.gshlTeamId) ?? [],
          ),
        ];
        const ownerTeams = teams.filter((t) =>
          contracts.some(
            (c) => c.ownerId === franchises.get(text(t.franchiseId))?.ownerId,
          ),
        );
        const allBoughtOut = contracts.every((c) =>
          ["Buyout", "Retired", "Injured"].includes(text(c.expiryStatus)),
        );
        // A later buyout does not erase a historical keeper. Stale end dates alone
        // cannot establish a keeper once opening-roster evidence contradicts them.
        if (
          allBoughtOut &&
          opening &&
          !ownerTeams.some((t) => rosterTeams.includes(t.id))
        ) {
          plan.excluded.push(
            `${name}: terminated contract not on its owner's opening roster (${opening.date})`,
          );
          continue;
        }
        let team = ownerTeams.length === 1 ? ownerTeams[0] : undefined;
        if (ownerTeams.length > 1) {
          const matches = ownerTeams.filter((t) => rosterTeams.includes(t.id));
          if (matches.length === 1) {
            team = matches[0];
            plan.notes.push(
              `${name}: duplicate contract ownership resolved by opening roster`,
            );
          }
        } else if (!ownerTeams.length && rosterTeams.length === 1) {
          team = teams.find((t) => t.id === rosterTeams[0]);
          if (team)
            plan.notes.push(
              `${name}: departed owner's contract carried by the opening-roster team`,
            );
        }
        if (!team) {
          plan.issues.push(
            `${name}: opening contract team is ambiguous or missing`,
          );
          continue;
        }
        if (
          opening &&
          rosterTeams.length &&
          !rosterTeams.includes(team.id) &&
          !existing.some((p) => p.gshlTeamId === team.id)
        ) {
          plan.issues.push(
            `${name}: contract ownership contradicts opening roster`,
          );
          continue;
        }
        plan.eligible++;
        if (existing.length) {
          if (existing.length === 1 && existing[0]?.gshlTeamId === team.id) {
            plan.accounted++;
            if (!existing[0].isSigning)
              plan.notes.push(
                `${name}: already present as an ordinary pick; preserved`,
              );
          } else
            plan.issues.push(
              `${name}: already selected elsewhere or duplicated; preserved`,
            );
          continue;
        }
        if (allBoughtOut && !opening) {
          plan.issues.push(
            `${name}: terminated contract needs historical opening-roster evidence`,
          );
          continue;
        }
        missing.set(team.id, [
          ...(missing.get(team.id) ?? []),
          { playerId, contracts },
        ]);
      }
      const maxPick = Math.max(
        0,
        ...picks.map((p) => (positive(p.pick) ? Number(p.pick) : 0)),
      );
      for (const [teamId, entries] of missing) {
        const team = teams.find((t) => t.id === teamId)!;
        const teamName =
          text(franchises.get(text(team.franchiseId))?.name) || teamId;
        const available = picks
          .filter(
            (p) =>
              !p.playerId &&
              (p.gshlTeamId === teamId ||
                (!p.gshlTeamId && p.originalTeamId === teamId)) &&
              (!p.originalTeamId || p.originalTeamId === teamId),
          )
          .sort(
            (a, b) =>
              Number(b.round) - Number(a.round) ||
              Number(b.pick) - Number(a.pick) ||
              a.id.localeCompare(b.id),
          );
        let after = maxPick;
        for (const entry of entries) {
          const slot = available.shift();
          let coordinates: { round: unknown; pick: unknown };
          if (slot)
            coordinates = { round: slot.round, pick: slot.pick ?? null };
          else {
            try {
              coordinates = inferDraftContinuation(
                picks,
                teams.map((t) => t.id),
              )(teamId, after);
            } catch (error) {
              plan.issues.push(
                `${players.get(entry.playerId)}: ${error instanceof Error ? error.message : "cannot infer snake"}`,
              );
              continue;
            }
            after = Number(coordinates.pick);
          }
          plan.changes.push({
            kind: slot ? "fill" : "insert",
            ...(slot ? { id: slot.id, before: slot } : {}),
            player: players.get(entry.playerId)!,
            team: teamName,
            contractIds: entry.contracts.map((c) => c.id),
            data: {
              seasonId: season.id,
              gshlTeamId: teamId,
              originalTeamId: teamId,
              ...coordinates,
              playerId: entry.playerId,
              isTraded: false,
              isSigning: true,
            },
          });
        }
      }
      return plan;
    });
}
