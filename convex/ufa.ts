/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/prefer-optional-chain */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  mutation,
  query,
} from "./_generated/server";

const CAP = 25_000_000;
const DAY = 86_400_000;

function requireServerSecret(secret: string) {
  const expected = process.env.CONVEX_SERVER_SECRET;
  if (!expected || secret !== expected) throw new Error("Unauthorized");
}

const num = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const torontoDate = (at = Date.now()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(at));

function percentile(value: number, population: number[]) {
  const valid = population.filter(Number.isFinite).sort((a, b) => a - b);
  if (!valid.length || !Number.isFinite(value)) return 0.5;
  if (valid.length === 1) return 0.5;
  const below = valid.filter((candidate) => candidate < value).length;
  const equal = valid.filter((candidate) => candidate === value).length;
  return Math.max(
    0,
    Math.min(1, (below + (equal - 1) / 2) / (valid.length - 1)),
  );
}

function coveredSeasonIds(contract: any, seasons: any[]) {
  const index = seasons.findIndex((season) => season._id === contract.seasonId);
  const length = num(contract.contractLength);
  return index < 0 || length < 1
    ? []
    : seasons.slice(index + 1, index + 1 + length).map((season) => season._id);
}

function isPlayingContract(contract: any) {
  if (["Buyout", "Retired", "Injured"].includes(String(contract.expiryStatus)))
    return false;
  const types = Array.isArray(contract.contractType)
    ? contract.contractType.map(String)
    : [String(contract.contractType)];
  return types.some(
    (type: string) => type === "STANDARD" || type === "EXTENSION",
  );
}

function normalizeDateOnly(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 10) : null;
}

function contractAffectsSeason(contract: any, season: any, seasons: any[]) {
  const seasonStart = normalizeDateOnly(season.startDate);
  const seasonEnd = normalizeDateOnly(season.endDate);
  const contractStart = normalizeDateOnly(contract.startDate);
  const contractEnd = normalizeDateOnly(
    contract.capHitEndDate ?? contract.expiryDate,
  );

  if (seasonStart && seasonEnd && contractStart && contractEnd) {
    return contractStart <= seasonEnd && contractEnd >= seasonStart;
  }

  return coveredSeasonIds(contract, seasons).includes(season._id);
}

function isUnsignedAfterSigningDeadline(
  playerId: any,
  signingSeasonId: any,
  contracts: any[],
  seasons: any[],
) {
  const signingSeason = seasons.find(
    (season) => season._id === signingSeasonId,
  );
  const signingEndDate = normalizeDateOnly(signingSeason?.signingEndDate);
  if (signingEndDate) {
    return !contracts.some((contract) => {
      if (contract.playerId !== playerId) return false;
      if (!isPlayingContract(contract)) return false;
      const expiryDate = normalizeDateOnly(contract.expiryDate);
      return Boolean(expiryDate && expiryDate > signingEndDate);
    });
  }

  const signingIndex = seasons.findIndex(
    (season) => season._id === signingSeasonId,
  );
  const contractSeason = seasons[signingIndex + 1];
  if (!contractSeason) return false;
  return !contracts.some(
    (contract) =>
      contract.playerId === playerId &&
      isPlayingContract(contract) &&
      coveredSeasonIds(contract, seasons).includes(contractSeason._id),
  );
}

function softmaxOdds(scores: Array<{ offerId: string; score: number }>) {
  if (scores.length === 1)
    return [{ offerId: scores[0]!.offerId, probability: 1 }];
  const max = Math.max(...scores.map((item) => item.score * 3));
  const weights = scores.map((item) => Math.exp(item.score * 3 - max));
  const total = weights.reduce((sum, value) => sum + value, 0);
  const remainder = Math.max(0, 1 - 0.05 * scores.length);
  return scores.map((item, index) => ({
    offerId: item.offerId,
    probability: 0.05 + remainder * ((weights[index] ?? 0) / total),
  }));
}

async function calculateOdds(ctx: any, groupId: any) {
  const db: any = ctx.db;
  const offers = await db
    .query("ufaOffers")
    .withIndex("by_group", (q: any) => q.eq("groupId", groupId))
    .collect();
  const pending = offers.filter((offer: any) => offer.status === "pending");
  if (!pending.length) return { odds: [], factors: new Map<string, unknown>() };

  const [
    group,
    players,
    contracts,
    teams,
    franchises,
    seasons,
    picks,
    matchups,
    nhlStats,
    teamAwards,
  ] = await Promise.all([
    db.get(groupId),
    db.query("players").collect(),
    db.query("contracts").collect(),
    db.query("teams").collect(),
    db.query("franchises").collect(),
    db.query("seasons").collect(),
    db.query("draftPicks").collect(),
    db.query("matchups").collect(),
    db.query("playerNhlStatLines").collect(),
    db.query("teamAwards").collect(),
  ]);
  if (!group) return { odds: [], factors: new Map<string, unknown>() };
  const orderedSeasons = [...seasons].sort((a, b) => num(a.year) - num(b.year));
  const signingIndex = orderedSeasons.findIndex(
    (season) => season._id === group.seasonId,
  );
  const player = players.find(
    (candidate: any) => candidate._id === group.playerId,
  );
  const position = String(player?.posGroup ?? "F");
  const relevantStats = nhlStats.filter((row: any) => {
    const index = orderedSeasons.findIndex(
      (season) => season._id === row.seasonId,
    );
    return index >= 0 && index <= signingIndex;
  });
  const latestIndex = Math.max(
    -1,
    ...relevantStats.map((row: any) =>
      orderedSeasons.findIndex((season) => season._id === row.seasonId),
    ),
  );
  const latestStats = relevantStats.filter(
    (row: any) =>
      orderedSeasons.findIndex((season) => season._id === row.seasonId) ===
      latestIndex,
  );
  const statByPlayer = new Map<string, any>(
    latestStats.map((row: any) => [String(row.playerId), row]),
  );
  const playerRating = num(
    statByPlayer.get(String(group.playerId))?.overallRating,
    num(player?.overallRating, 0),
  );
  const peerRatings = players
    .filter((candidate: any) => String(candidate.posGroup ?? "F") === position)
    .map((candidate: any) =>
      num(
        statByPlayer.get(String(candidate._id))?.overallRating,
        num(candidate.overallRating, 0),
      ),
    );
  const playerPercentile = percentile(playerRating, peerRatings);

  const franchiseById = new Map<string, any>(
    franchises.map((franchise: any) => [String(franchise._id), franchise]),
  );
  const ownerByTeamId = new Map<string, string>(
    teams.map((team: any) => [
      String(team._id),
      String(franchiseById.get(String(team.franchiseId))?.ownerId ?? ""),
    ]),
  );
  const ladderByOwner = new Map<string, number>(
    franchises.map((franchise: any) => [String(franchise.ownerId), 250]),
  );
  const chronologicalMatches = [...matchups].sort((a: any, b: any) =>
    String(a.createdAt ?? a._creationTime).localeCompare(
      String(b.createdAt ?? b._creationTime),
    ),
  );
  for (const matchup of chronologicalMatches) {
    const homeOwner = ownerByTeamId.get(String(matchup.homeTeamId));
    const awayOwner = ownerByTeamId.get(String(matchup.awayTeamId));
    const homeScore = num(matchup.homeScore, Number.NaN);
    const awayScore = num(matchup.awayScore, Number.NaN);
    if (
      !homeOwner ||
      !awayOwner ||
      homeOwner === awayOwner ||
      !Number.isFinite(homeScore) ||
      !Number.isFinite(awayScore)
    )
      continue;
    const homeRating = ladderByOwner.get(homeOwner) ?? 250;
    const awayRating = ladderByOwner.get(awayOwner) ?? 250;
    const expected = 1 / (1 + 10 ** ((awayRating - homeRating) / 400));
    const actual =
      homeScore === awayScore ? 0.5 : homeScore > awayScore ? 1 : 0;
    const type = String(matchup.gameType);
    const k = type === "F" ? 40 : type === "SF" ? 34 : type === "QF" ? 28 : 20;
    const delta = k * (actual - expected);
    ladderByOwner.set(homeOwner, homeRating + delta);
    ladderByOwner.set(awayOwner, awayRating - delta);
  }
  for (const award of teamAwards) {
    const ownerId = String(award.ownerId ?? "");
    if (!ownerId || !ladderByOwner.has(ownerId)) continue;
    const name = String(award.award);
    const bonus =
      name === "gshlCup"
        ? 40
        : name === "gmoy" || name === "jackAdams"
          ? 20
          : name === "brophy"
            ? -10
            : 5;
    ladderByOwner.set(ownerId, (ladderByOwner.get(ownerId) ?? 250) + bonus);
  }
  const ownerWinScores = [...ladderByOwner.entries()].map(
    ([ownerId, value]) => ({ ownerId, value }),
  );
  const ladderPopulation = ownerWinScores.map(
    (entry: { value: number }) => entry.value,
  );

  const draftRawByFranchise = new Map<string, number>();
  for (const franchise of franchises) {
    let raw = 0;
    [1, 2, 3].forEach((offset, idx) => {
      const season = orderedSeasons[signingIndex + offset];
      if (!season) return;
      const seasonTeamIds = new Set(
        teams
          .filter(
            (team: any) =>
              team.franchiseId === franchise._id &&
              team.seasonId === season._id,
          )
          .map((team: any) => String(team._id)),
      );
      const multiplier = [1, 0.7, 0.5][idx] ?? 0;
      picks
        .filter(
          (pick: any) =>
            pick.seasonId === season._id &&
            !pick.playerId &&
            seasonTeamIds.has(String(pick.gshlTeamId)),
        )
        .forEach((pick: any) => {
          raw += (Math.max(1, 16 - num(pick.round, 15)) / 15) * multiplier;
        });
    });
    draftRawByFranchise.set(String(franchise._id), raw);
  }
  const draftPopulation = [...draftRawByFranchise.values()];
  const performanceRawByFranchise = new Map<string, number>();
  for (const franchise of franchises) {
    const priorSeason = orderedSeasons[Math.max(0, signingIndex - 1)];
    const priorTeam = teams.find(
      (team: any) =>
        team.franchiseId === franchise._id &&
        team.seasonId === priorSeason?._id,
    );
    const priorMatches = priorTeam
      ? matchups.filter(
          (matchup: any) =>
            matchup.seasonId === priorTeam.seasonId &&
            (matchup.homeTeamId === priorTeam._id ||
              matchup.awayTeamId === priorTeam._id),
        )
      : [];
    let points = 0;
    let games = 0;
    let playoff = 0.2;
    for (const matchup of priorMatches) {
      const hs = num(matchup.homeScore, Number.NaN);
      const as = num(matchup.awayScore, Number.NaN);
      if (!Number.isFinite(hs) || !Number.isFinite(as)) continue;
      const home = matchup.homeTeamId === priorTeam?._id;
      const won = (home && hs > as) || (!home && as > hs);
      const type = String(matchup.gameType);
      if (type === "CC" || type === "NC") {
        games += 1;
        points += hs === as ? 0.5 : won ? 1 : 0;
      } else if (type === "F") playoff = Math.max(playoff, won ? 1 : 0.8);
      else if (type === "SF") playoff = Math.max(playoff, 0.6);
      else if (type === "QF") playoff = Math.max(playoff, 0.4);
    }
    performanceRawByFranchise.set(
      String(franchise._id),
      0.7 * (games ? points / games : 0.5) + 0.3 * playoff,
    );
  }
  const performancePopulation = [...performanceRawByFranchise.values()];
  const factors = new Map<string, unknown>();
  const scores = pending.map((offer: any) => {
    const franchise = franchises.find(
      (candidate: any) => candidate._id === offer.franchiseId,
    );
    const ownerWin =
      ownerWinScores.find(
        (entry: { ownerId: string; value: number }) =>
          entry.ownerId === String(offer.ownerId),
      )?.value ?? 0.5;
    const performance = percentile(
      performanceRawByFranchise.get(String(offer.franchiseId)) ?? 0.5,
      performancePopulation,
    );
    const nextSeasonId = orderedSeasons[signingIndex + 1]?._id;
    const ownerContracts = contracts.filter(
      (contract: any) =>
        contract.ownerId === offer.ownerId &&
        Boolean(
          nextSeasonId &&
            coveredSeasonIds(contract, orderedSeasons).includes(nextSeasonId),
        ),
    );
    const contractedPlayers = ownerContracts
      .map((contract: any) =>
        players.find((candidate: any) => candidate._id === contract.playerId),
      )
      .filter(Boolean);
    const qualityValues = contractedPlayers
      .map((candidate: any) =>
        percentile(
          num(
            statByPlayer.get(String(candidate._id))?.overallRating,
            num(candidate.overallRating, 0),
          ),
          players.map((item: any) =>
            num(
              statByPlayer.get(String(item._id))?.overallRating,
              num(item.overallRating, 0),
            ),
          ),
        ),
      )
      .sort((a: number, b: number) => b - a)
      .slice(0, 3);
    const quality = qualityValues.length
      ? qualityValues.reduce((sum: number, value: number) => sum + value, 0) /
        qualityValues.length
      : 0.5;
    const samePosition = contractedPlayers.filter(
      (candidate: any) => String(candidate.posGroup ?? "F") === position,
    ).length;
    const opportunity = samePosition === 0 ? 1 : samePosition === 1 ? 0.5 : 0;
    const rosterFit =
      (0.35 + 0.3 * playerPercentile) * quality +
      (0.65 - 0.3 * playerPercentile) * opportunity;
    const ladder = percentile(ownerWin, ladderPopulation);
    const draft = percentile(
      draftRawByFranchise.get(String(franchise?._id)) ?? 0,
      draftPopulation,
    );
    const term = (num(offer.contractLength) - 1) / 2;
    const score =
      0.25 * term +
      (0.1 + 0.1 * playerPercentile) * performance +
      0.25 * rosterFit +
      0.15 * ladder +
      (0.25 - 0.1 * playerPercentile) * draft;
    factors.set(String(offer._id), {
      term,
      performance,
      ladder,
      draft,
      playerPerformance: playerPercentile,
      quality,
      opportunity,
      rosterFit,
      score,
    });
    return { offerId: String(offer._id), score };
  });
  return { odds: softmaxOdds(scores), factors };
}

export const listState = query({
  args: { serverSecret: v.string() },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const db: any = ctx.db;
    const groups = await db.query("ufaOfferGroups").collect();
    const offers = await db.query("ufaOffers").collect();
    const oddsEntries = await Promise.all(
      groups
        .filter((group: any) => group.status === "open")
        .map(
          async (group: any) =>
            [
              String(group._id),
              (await calculateOdds(ctx, group._id)).odds,
            ] as const,
        ),
    );
    return {
      groups: groups.map((group: any) => ({ ...group, id: group._id })),
      offers: offers.map((offer: any) => ({ ...offer, id: offer._id })),
      oddsByGroup: Object.fromEntries(oddsEntries),
    };
  },
});

export const submitOffer = mutation({
  args: {
    serverSecret: v.string(),
    ownerId: v.id("owners"),
    playerId: v.id("players"),
    contractLength: v.number(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const db: any = ctx.db;
    if (![1, 2, 3].includes(args.contractLength))
      throw new Error("Contract length must be 1, 2, or 3 years.");
    const now = Date.now();
    const [player, seasons, franchises, teams, contracts] = await Promise.all([
      db.get(args.playerId),
      db.query("seasons").collect(),
      db.query("franchises").collect(),
      db.query("teams").collect(),
      db.query("contracts").collect(),
    ]);
    if (!player || !player.isActive)
      throw new Error("This player is no longer an eligible UFA.");
    const orderedSeasons = [...seasons].sort(
      (a: any, b: any) => num(a.year) - num(b.year),
    );
    const signingSeason = orderedSeasons.find((season: any) => season.isActive);
    if (!signingSeason) throw new Error("There is no active signing season.");
    if (
      !signingSeason.signingEndDate ||
      torontoDate(now) <= String(signingSeason.signingEndDate)
    ) {
      throw new Error("Summer Free Agency is not open.");
    }
    if (
      !isUnsignedAfterSigningDeadline(
        player._id,
        signingSeason._id,
        contracts,
        orderedSeasons,
      )
    ) {
      throw new Error("This player is already under contract.");
    }
    const franchise = franchises.find(
      (candidate: any) =>
        candidate.ownerId === args.ownerId && candidate.isActive,
    );
    if (!franchise)
      throw new Error("Your account is not linked to an active franchise.");
    const team = teams.find(
      (candidate: any) =>
        candidate.franchiseId === franchise._id &&
        candidate.seasonId === signingSeason._id,
    );
    if (!team)
      throw new Error(
        "Your franchise does not have a team in the signing season.",
      );
    const salary = Math.round(num(player.salary, 0) * 1.25);
    if (salary <= 0)
      throw new Error("This player does not have a valid salary.");

    let group = await db
      .query("ufaOfferGroups")
      .withIndex("by_player_season", (q: any) =>
        q.eq("playerId", args.playerId).eq("seasonId", signingSeason._id),
      )
      .first();
    if (group && (group.status !== "open" || group.deadlineAt <= now)) {
      throw new Error("Offers for this player are closed.");
    }
    if (group) {
      const duplicate = await db
        .query("ufaOffers")
        .withIndex("by_group_franchise", (q: any) =>
          q.eq("groupId", group!._id).eq("franchiseId", franchise._id),
        )
        .first();
      if (duplicate)
        throw new Error(
          "Your franchise has already made a binding offer to this player.",
        );
    }

    const signingIndex = orderedSeasons.findIndex(
      (season: any) => season._id === signingSeason._id,
    );
    const newCovered = orderedSeasons.slice(
      signingIndex + 1,
      signingIndex + 1 + args.contractLength,
    );
    if (newCovered.length !== args.contractLength)
      throw new Error("The required future seasons are not configured.");
    const pendingOffers = await db
      .query("ufaOffers")
      .withIndex("by_owner_status", (q: any) =>
        q.eq("ownerId", args.ownerId).eq("status", "pending"),
      )
      .collect();
    for (const season of newCovered) {
      const committed = contracts
        .filter(
          (contract: any) =>
            contract.ownerId === args.ownerId &&
            contractAffectsSeason(contract, season, orderedSeasons),
        )
        .reduce(
          (sum: number, contract: any) =>
            sum + num(contract.capHit, num(contract.contractSalary)),
          0,
        );
      const reserved = pendingOffers
        .filter((offer: any) => {
          const offerIndex = orderedSeasons.findIndex(
            (item: any) => item._id === offer.seasonId,
          );
          return orderedSeasons
            .slice(offerIndex + 1, offerIndex + 1 + num(offer.contractLength))
            .some((item: any) => item._id === season._id);
        })
        .reduce((sum: number, offer: any) => sum + num(offer.salary), 0);
      if (committed + reserved + salary > CAP) {
        throw new Error(
          `Your franchise does not have enough cap space for ${season.name ?? season.year}.`,
        );
      }
    }

    if (!group) {
      const deadlineAt = now + 7 * DAY;
      const groupId = await db.insert("ufaOfferGroups", {
        playerId: args.playerId,
        seasonId: signingSeason._id,
        deadlineAt,
        status: "open",
        createdAt: now,
        updatedAt: now,
      });
      group = await db.get(groupId);
      await ctx.scheduler.runAt(deadlineAt, internal.ufa.resolveGroup, {
        groupId,
      });
    }
    if (!group) throw new Error("Unable to create the offer group.");
    const offerId = await db.insert("ufaOffers", {
      groupId: group._id,
      playerId: args.playerId,
      seasonId: signingSeason._id,
      ownerId: args.ownerId,
      franchiseId: franchise._id,
      teamId: team._id,
      contractLength: args.contractLength,
      salary,
      status: "pending",
      submittedAt: now,
      updatedAt: now,
    });
    return { offerId, groupId: group._id, deadlineAt: group.deadlineAt };
  },
});

export const resolveGroup = internalAction({
  args: { groupId: v.id("ufaOfferGroups") },
  handler: async (ctx, args) => {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    const roll = (values[0] ?? 0) / 2 ** 32;
    await ctx.runMutation(internal.ufa.finalizeGroup, { ...args, roll });
  },
});

export const finalizeGroup = internalMutation({
  args: { groupId: v.id("ufaOfferGroups"), roll: v.number() },
  handler: async (ctx, args) => {
    const db: any = ctx.db;
    const group = await db.get(args.groupId);
    if (!group || group.status === "resolved" || group.status === "resolving")
      return;
    if (Date.now() < group.deadlineAt) return;
    await db.patch(group._id, { status: "resolving", updatedAt: Date.now() });
    try {
      const { odds, factors } = await calculateOdds(ctx, group._id);
      if (!odds.length) throw new Error("No valid pending offers remain.");
      let cumulative = 0;
      let winningId = odds.at(-1)!.offerId;
      for (const entry of odds) {
        cumulative += entry.probability;
        if (args.roll < cumulative) {
          winningId = entry.offerId;
          break;
        }
      }
      const offers = await db
        .query("ufaOffers")
        .withIndex("by_group", (q: any) => q.eq("groupId", group._id))
        .collect();
      const winningOffer = offers.find(
        (offer: any) => String(offer._id) === winningId,
      );
      const player = await db.get(group.playerId);
      const seasons = (await db.query("seasons").collect()).sort(
        (a: any, b: any) => num(a.year) - num(b.year),
      );
      const signingIndex = seasons.findIndex(
        (season: any) => season._id === group.seasonId,
      );
      const startSeason = seasons[signingIndex + 1];
      const expirySeason =
        seasons[signingIndex + num(winningOffer?.contractLength)];
      const priorContracts = await db.query("contracts").collect();
      if (
        !winningOffer ||
        !player ||
        !isUnsignedAfterSigningDeadline(
          player._id,
          group.seasonId,
          priorContracts,
          seasons,
        ) ||
        !startSeason?.startDate ||
        !expirySeason?.endDate
      ) {
        throw new Error("The winning contract can no longer be created.");
      }
      const continuous = priorContracts.some(
        (contract: any) =>
          contract.playerId === player._id &&
          coveredSeasonIds(contract, seasons).includes(group.seasonId),
      );
      const nowIso = new Date().toISOString();
      await db.insert("contracts", {
        playerId: player._id,
        ownerId: winningOffer.ownerId,
        seasonId: group.seasonId,
        contractType: continuous ? "EXTENSION" : "STANDARD",
        contractLength: winningOffer.contractLength,
        contractSalary: winningOffer.salary,
        signingDate: torontoDate(),
        startDate: startSeason.startDate,
        signingStatus: "UFA",
        expiryStatus: continuous ? "UFA" : "RFA",
        expiryDate: expirySeason.endDate,
        capHit: winningOffer.salary,
        capHitEndDate: expirySeason.endDate,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      await db.patch(player._id, {
        gshlTeamId: winningOffer.teamId,
        isSignable: false,
        isResignable: null,
        lineupPos: null,
        updatedAt: nowIso,
      });
      for (const offer of offers) {
        await db.patch(offer._id, {
          status: offer._id === winningOffer._id ? "won" : "lost",
          factorSnapshot: JSON.stringify(factors.get(String(offer._id)) ?? {}),
          updatedAt: Date.now(),
        });
      }
      await db.patch(group._id, {
        status: "resolved",
        winningOfferId: winningOffer._id,
        finalOdds: JSON.stringify(odds),
        randomRoll: args.roll,
        resolvedAt: Date.now(),
        updatedAt: Date.now(),
      });
    } catch (error) {
      await db.patch(group._id, {
        status: "failed",
        failureReason:
          error instanceof Error ? error.message : "Resolution failed",
        updatedAt: Date.now(),
      });
      return;
    }
  },
});

export const reconcile = mutation({
  args: { serverSecret: v.string() },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const db: any = ctx.db;
    const groups = await db.query("ufaOfferGroups").collect();
    const due = groups.filter(
      (group: any) =>
        (group.status === "open" || group.status === "failed") &&
        group.deadlineAt <= Date.now(),
    );
    for (const group of due) {
      if (group.status === "failed") {
        await db.patch(group._id, {
          status: "open",
          failureReason: undefined,
          updatedAt: Date.now(),
        });
      }
      await ctx.scheduler.runAfter(0, internal.ufa.resolveGroup, {
        groupId: group._id,
      });
    }
    return { queued: due.length };
  },
});
