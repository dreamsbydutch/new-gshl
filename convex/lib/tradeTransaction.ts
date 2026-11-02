import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { selectSeasonScope } from "../../src/lib/utils/domain/season-scope";
import { getTorontoDate } from "../../src/lib/utils/domain/contracts";
import { SALARY_CAP } from "../../src/lib/utils/domain/constants";
import { toUtcTimestamp, utcTimestampToDateKey as day } from "./timestamps";

export type TradeRequest = {
  seasonId: Id<"seasons">;
  teamAId: Id<"teams">;
  teamBId: Id<"teams">;
  effectiveDate: string;
  playerIdsA: Id<"players">[];
  playerIdsB: Id<"players">[];
  pickIdsA: Id<"draftPicks">[];
  pickIdsB: Id<"draftPicks">[];
  notes: string;
};
type Ctx = QueryCtx | MutationCtx;
function bounded<T>(rows: T[], maximum: number, label: string): T[] {
  if (rows.length > maximum)
    throw Error(`${label} exceeds the supported trade scope`);
  return rows;
}
export function tradeFingerprint(request: TradeRequest) {
  return JSON.stringify({
    seasonId: request.seasonId,
    teamAId: request.teamAId,
    teamBId: request.teamBId,
    effectiveDate: request.effectiveDate,
    notes: request.notes.trim(),
    playerIdsA: [...request.playerIdsA].sort(),
    playerIdsB: [...request.playerIdsB].sort(),
    pickIdsA: [...request.pickIdsA].sort(),
    pickIdsB: [...request.pickIdsB].sort(),
  });
}
function transferableKind(contract: Doc<"contracts">) {
  return (
    ["STANDARD", "EXTENSION"].includes(contract.contractType) &&
    !["Buyout", "Trade", "Retired", "Injured"].includes(
      contract.expiryStatus ?? "",
    )
  );
}
function signedDay(contract: Doc<"contracts">) {
  const value = contract.signingDate ?? contract.startDate;
  const instant = toUtcTimestamp(value);
  if (instant === null) return null;
  // Imported date-only values retain their key; live signing instants use Toronto.
  return instant % 86400000 === 0
    ? day(value)
    : getTorontoDate(new Date(instant));
}
export function playingTradeContract(contract: Doc<"contracts">, date: string) {
  const signed = signedDay(contract),
    expires = day(contract.expiryDate);
  return (
    transferableKind(contract) &&
    signed !== null &&
    signed <= date &&
    expires !== null &&
    expires >= date
  );
}
export async function tradeSources(
  ctx: Ctx,
  seasonId: Id<"seasons">,
  teamAId: Id<"teams">,
  teamBId: Id<"teams">,
) {
  if (teamAId === teamBId) throw Error("Choose two different teams");
  const [season, teamA, teamB, rawSeasons] = await Promise.all([
    ctx.db.get(seasonId),
    ctx.db.get(teamAId),
    ctx.db.get(teamBId),
    ctx.db.query("seasons").take(201),
  ]);
  if (
    !season ||
    season.nhlOnly ||
    !season.isActive ||
    !teamA ||
    !teamB ||
    teamA.seasonId !== seasonId ||
    teamB.seasonId !== seasonId
  )
    throw Error("Choose two teams from the active GSHL season");
  const [franchiseA, franchiseB] = await Promise.all([
    ctx.db.get(teamA.franchiseId),
    ctx.db.get(teamB.franchiseId),
  ]);
  if (!franchiseA || !franchiseB || franchiseA.ownerId === franchiseB.ownerId)
    throw Error("Each trade team must have a different owner");
  const seasons = selectSeasonScope(bounded(rawSeasons, 200, "Seasons")).sort(
    (a, b) => Number(a.year) - Number(b.year),
  );
  const futureSeasons = seasons.filter(
    (s) => Number(s.year) >= Number(season.year),
  );
  const franchises = bounded(
    await ctx.db.query("franchises").take(501),
    500,
    "Franchises",
  );
  const ownerByFranchise = new Map(franchises.map((f) => [f._id, f.ownerId]));
  const seasonTeams = (
    await Promise.all(
      futureSeasons.map((s) =>
        ctx.db
          .query("teams")
          .withIndex("by_seasonId", (q) => q.eq("seasonId", s._id))
          .take(65),
      ),
    )
  ).flatMap((rows) => bounded(rows, 64, "Season teams"));
  const teams = seasonTeams.filter((t) =>
    [franchiseA.ownerId, franchiseB.ownerId].includes(
      ownerByFranchise.get(t.franchiseId)!,
    ),
  );
  const contracts = (
    await Promise.all(
      [franchiseA.ownerId, franchiseB.ownerId].map((ownerId) =>
        ctx.db
          .query("contracts")
          .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
          .take(301),
      ),
    )
  ).flatMap((rows) => bounded(rows, 300, "Owner contracts"));
  const picks = (
    await Promise.all(
      teams.map((t) =>
        ctx.db
          .query("draftPicks")
          .withIndex("by_gshlTeamId", (q) => q.eq("gshlTeamId", t._id))
          .take(101),
      ),
    )
  ).flatMap((rows) => bounded(rows, 100, "Team picks"));
  return {
    season,
    teamA,
    teamB,
    franchiseA,
    franchiseB,
    seasons,
    futureSeasons,
    teams,
    contracts,
    picks,
    ownerByFranchise,
  };
}

/** All ownership, cap, and keeper-pick checks finish before the caller writes. */
export async function prepareTrade(ctx: Ctx, request: TradeRequest) {
  const ids = [...request.playerIdsA, ...request.playerIdsB];
  const pickIds = [...request.pickIdsA, ...request.pickIdsB];
  if (!ids.length && !pickIds.length)
    throw Error("Choose at least one player or draft pick");
  if (
    ids.length > 20 ||
    pickIds.length > 30 ||
    new Set(ids).size !== ids.length ||
    new Set(pickIds).size !== pickIds.length
  )
    throw Error("Trade assets must be unique and within the supported limit");
  if (request.notes.length > 1000)
    throw Error("Trade notes are limited to 1,000 characters");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(request.effectiveDate) ||
    day(request.effectiveDate) !== request.effectiveDate ||
    request.effectiveDate > getTorontoDate()
  )
    throw Error("Choose a valid trade date that is not in the future");
  const source = await tradeSources(
    ctx,
    request.seasonId,
    request.teamAId,
    request.teamBId,
  );
  if (
    request.effectiveDate < (day(source.season.startDate) ?? "9999") ||
    request.effectiveDate > (day(source.season.endDate) ?? "")
  )
    throw Error("The trade date must fall in the selected season");
  const {
    teamA,
    teamB,
    franchiseA,
    franchiseB,
    contracts,
    teams,
    seasons,
    futureSeasons,
    ownerByFranchise,
  } = source;
  const teamOwner = (team: Doc<"teams">) =>
    ownerByFranchise.get(team.franchiseId)!;
  const receivingTeam = (seasonId: Id<"seasons">, ownerId: Id<"owners">) => {
    const matches = teams.filter(
      (t) => t.seasonId === seasonId && teamOwner(t) === ownerId,
    );
    if (matches.length !== 1)
      throw Error(
        "Each future season must have exactly one team for the receiving owner",
      );
    return matches[0]!;
  };
  const playerDocs = await Promise.all(ids.map((id) => ctx.db.get(id)));
  const transferredPlayers: Array<{
    player: Doc<"players">;
    from: Doc<"teams">;
    to: Doc<"teams">;
    contracts: Doc<"contracts">[];
  }> = [];
  const contractOwners = new Map<Id<"contracts">, Id<"owners">>();
  const allContracts = new Map(contracts.map((c) => [c._id, c]));
  for (let index = 0; index < ids.length; index++) {
    const player = playerDocs[index];
    if (!player?.isActive)
      throw Error("A selected player is missing or inactive");
    const from = request.playerIdsA.includes(player._id) ? teamA : teamB;
    const to = from._id === teamA._id ? teamB : teamA;
    if (
      player.ownerId &&
      ![teamOwner(from), teamOwner(to)].includes(player.ownerId)
    )
      throw Error(`${player.fullName} belongs to a third team`);
    if (player.gshlTeamId && ![from._id, to._id].includes(player.gshlTeamId))
      throw Error(`${player.fullName} is assigned to a third team`);
    const playerContracts = bounded(
      await ctx.db
        .query("contracts")
        .withIndex("by_playerId", (q) => q.eq("playerId", player._id))
        .take(51),
      50,
      "Player contracts",
    );
    for (const contract of playerContracts.filter(transferableKind)) {
      const expires = day(contract.expiryDate);
      if (!expires)
        throw Error(
          `${player.fullName}'s contract expiry must be resolved first`,
        );
      if (expires < request.effectiveDate) continue;
      const signed = signedDay(contract);
      if (!signed || signed > request.effectiveDate)
        throw Error(
          `${player.fullName} has a contract signed after the trade date; resolve the transaction order first`,
        );
    }
    const moving = playerContracts.filter((c) =>
      playingTradeContract(c, request.effectiveDate),
    );
    for (const contract of moving) {
      if (contract.ownerId !== teamOwner(from))
        throw Error(
          `${player.fullName}'s contract is not owned by the sending team`,
        );
      if (
        contract.contractSalary == null ||
        contract.contractSalary === "" ||
        !Number.isFinite(Number(contract.contractSalary)) ||
        Number(contract.contractSalary) < 0 ||
        !Number.isInteger(Number(contract.contractLength)) ||
        Number(contract.contractLength) < 1 ||
        Number(contract.contractLength) > 3
      )
        throw Error(
          `${player.fullName}'s contract salary and term must be resolved first`,
        );
      if (
        !day(contract.startDate) ||
        !day(contract.expiryDate) ||
        Number(day(contract.expiryDate)!.slice(0, 4)) >
          Math.max(...futureSeasons.map((s) => Number(s.year)))
      )
        throw Error(
          "Configure every remaining contract season before recording the trade",
        );
      allContracts.set(contract._id, contract);
      contractOwners.set(contract._id, teamOwner(to));
    }
    for (let i = 0; i < moving.length; i++)
      for (let j = i + 1; j < moving.length; j++) {
        const left = moving[i]!,
          right = moving[j]!;
        if (
          day(left.startDate)! <= day(right.expiryDate)! &&
          day(right.startDate)! <= day(left.expiryDate)!
        )
          throw Error(`${player.fullName} has overlapping contracts`);
      }
    for (const contract of moving)
      for (
        let year = Number(source.season.year);
        year <= Number(day(contract.expiryDate)!.slice(0, 4));
        year++
      ) {
        if (!futureSeasons.some((season) => Number(season.year) === year))
          throw Error(
            "Configure every remaining contract season before recording the trade",
          );
      }
    if (!moving.length && !player.ownerId)
      throw Error(`${player.fullName} has no team or transferable contract`);
    transferredPlayers.push({ player, from, to, contracts: moving });
  }
  const pickById = new Map(source.picks.map((p) => [p._id, { ...p }]));
  const originalPicks = new Map(source.picks.map((p) => [p._id, p]));
  const seasonById = new Map(seasons.map((s) => [s._id, s]));
  const pendingDraft = (season: Doc<"seasons">) => {
    const date = day(season.startDate);
    const draft = toUtcTimestamp(season.draftStartAt);
    return Boolean(
      date &&
        date > request.effectiveDate &&
        (draft === null || draft > Date.now()),
    );
  };
  const pickTransfers: Array<{
    pickId: Id<"draftPicks">;
    label: string;
    fromTeamId: Id<"teams">;
    toTeamId: Id<"teams">;
  }> = [];
  for (const id of pickIds) {
    const pick = pickById.get(id);
    const from = request.pickIdsA.includes(id) ? teamA : teamB;
    const to = from._id === teamA._id ? teamB : teamA;
    const pickTeam = teams.find((t) => t._id === pick?.gshlTeamId);
    const season = pick && seasonById.get(pick.seasonId);
    if (!pick || !pickTeam || teamOwner(pickTeam) !== teamOwner(from))
      throw Error("A selected pick no longer belongs to the sending team");
    if (
      !season ||
      !pendingDraft(season) ||
      pick.playerId ||
      pick.isSigning ||
      pick.onClockStartedAt != null ||
      pick.onClockExpiresAt != null ||
      pick.onClockEndedAt != null
    )
      throw Error(
        "Only unused, unreserved picks from drafts that have not started can be traded",
      );
    const destination = receivingTeam(pick.seasonId, teamOwner(to));
    pickTransfers.push({
      pickId: id,
      label: `${season.name} · Round ${pick.round}, pick ${pick.pick ?? "—"}`,
      fromTeamId: from._id,
      toTeamId: to._id,
    });
    pick.gshlTeamId = destination._id;
    pick.originalTeamId ??= pickTeam._id;
    pick.isTraded = true;
  }
  const movingIds = new Set(ids);
  for (const pick of pickById.values()) {
    const season = seasonById.get(pick.seasonId);
    if (
      season &&
      pendingDraft(season) &&
      pick.isSigning &&
      pick.playerId &&
      movingIds.has(pick.playerId)
    ) {
      if (
        pick.onClockStartedAt != null ||
        pick.onClockExpiresAt != null ||
        pick.onClockEndedAt != null
      )
        throw Error("A keeper reservation is locked by its draft");
      pick.playerId = null;
      pick.isSigning = false;
    }
  }
  const reservations: Array<{
    playerId: Id<"players">;
    playerName: string;
    seasonName: string;
    teamName: string;
    pickLabel: string;
    pickId: Id<"draftPicks">;
  }> = [];
  for (const move of [...transferredPlayers].sort((a, b) =>
    a.player._id.localeCompare(b.player._id),
  )) {
    for (const season of futureSeasons) {
      const start = day(season.startDate);
      if (!start) throw Error("Future season dates are required");
      if (start <= request.effectiveDate) continue;
      const covering = move.contracts.filter(
        (c) =>
          day(c.startDate) &&
          day(c.startDate)! <= start &&
          day(c.expiryDate) &&
          day(c.expiryDate)! >= start,
      );
      if (covering.length > 1)
        throw Error(`${move.player.fullName} has overlapping contracts`);
      if (!covering.length) continue;
      if (!pendingDraft(season))
        throw Error(
          `The ${season.name} draft has already started; keeper reservations are locked`,
        );
      const destination = receivingTeam(season._id, teamOwner(move.to));
      const available = [...pickById.values()]
        .filter(
          (p) =>
            p.seasonId === season._id &&
            p.gshlTeamId === destination._id &&
            !p.playerId &&
            !p.isSigning &&
            p.onClockStartedAt == null &&
            p.onClockExpiresAt == null &&
            p.onClockEndedAt == null,
        )
        .sort(
          (a, b) =>
            Number(b.round) - Number(a.round) ||
            Number(b.pick) - Number(a.pick) ||
            b._id.localeCompare(a._id),
        )[0];
      if (!available)
        throw Error(
          `No keeper pick is available for ${move.player.fullName} in ${season.name}`,
        );
      available.playerId = move.player._id;
      available.isSigning = true;
      reservations.push({
        playerId: move.player._id,
        playerName: move.player.fullName,
        seasonName: season.name,
        teamName: move.to._id === teamA._id ? franchiseA.name : franchiseB.name,
        pickId: available._id,
        pickLabel: `Round ${available.round}, pick ${available.pick ?? "—"}`,
      });
    }
  }
  const caps: Array<{
    teamName: string;
    seasonName: string;
    committed: number;
  }> = [];
  for (const owner of [franchiseA.ownerId, franchiseB.ownerId]) {
    for (const season of futureSeasons) {
      const start = day(season.startDate),
        end = day(season.endDate);
      if (!start || !end)
        throw Error("Season dates are required for cap checks");
      let committed = 0;
      for (const contract of allContracts.values()) {
        if ((contractOwners.get(contract._id) ?? contract.ownerId) !== owner)
          continue;
        const from = day(contract.startDate),
          through = day(contract.capHitEndDate ?? contract.expiryDate);
        if (!from || !through)
          throw Error("Contract dates are required for cap checks");
        if (from > end || through < start) continue;
        const rawSalary = contract.capHit ?? contract.contractSalary;
        const salary = Number(rawSalary);
        if (
          rawSalary == null ||
          rawSalary === "" ||
          !Number.isFinite(salary) ||
          salary < 0
        )
          throw Error("Contract cap charges must be valid");
        committed += salary;
      }
      if (committed > SALARY_CAP)
        throw Error(
          `${owner === franchiseA.ownerId ? franchiseA.name : franchiseB.name} would exceed the salary cap in ${season.name}`,
        );
      caps.push({
        teamName:
          owner === franchiseA.ownerId ? franchiseA.name : franchiseB.name,
        seasonName: season.name,
        committed,
      });
    }
  }
  const pickChanges = [...pickById.values()].filter(
    (p) => JSON.stringify(p) !== JSON.stringify(originalPicks.get(p._id)),
  );
  const version = JSON.stringify({
    request: tradeFingerprint(request),
    franchises: [franchiseA, franchiseB],
    players: playerDocs,
    contracts: [...allContracts.values()].sort((a, b) =>
      a._id.localeCompare(b._id),
    ),
    picks: source.picks,
    teams,
    seasons,
  });
  return {
    source,
    transferredPlayers,
    contractOwners,
    pickChanges,
    version,
    preview: {
      version,
      teamAName: franchiseA.name,
      teamBName: franchiseB.name,
      players: transferredPlayers.map((m) => ({
        playerId: m.player._id,
        playerName: m.player.fullName,
        fromTeamId: m.from._id,
        toTeamId: m.to._id,
        contractIds: m.contracts.map((c) => c._id),
        contracts: m.contracts.map((c) => ({
          salary: Number(c.contractSalary),
          expires: day(c.expiryDate),
          status: c.expiryStatus,
        })),
      })),
      picks: pickTransfers,
      reservations,
      caps,
    },
  };
}
