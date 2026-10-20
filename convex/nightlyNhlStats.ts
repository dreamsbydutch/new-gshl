import { mutation, query } from "./_generated/server";
import { v, type Infer } from "convex/values";
import {
  nightlyPlayerFields,
  nightlyTeamFields,
} from "./lib/nightlyNhlStatFields";
import { type nhlStatLineHockeyRating } from "./lib/nhlSeasonValueFields";
import { validateSeasonValue } from "./nhlSeasonValues";

const MODEL = "nhl-hockey-overall-reviewed-v1";
type Row = Record<string, unknown>;
const playerFields = v.object(nightlyPlayerFields);
function authorize(secret: string) {
  if (
    !process.env.CONVEX_SERVER_SECRET ||
    secret !== process.env.CONVEX_SERVER_SECRET
  )
    throw Error("Unauthorized NHL refresh");
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, x]) => `${JSON.stringify(k)}:${stable(x)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
function population(rows: readonly Row[]) {
  return stable(
    [...rows].sort((a, b) => String(a._id).localeCompare(String(b._id))),
  );
}

const officialIdentity = v.object({
  nhlPlayerId: v.number(),
  firstName: v.string(),
  lastName: v.string(),
  birthDate: v.string(),
  position: v.union(
    v.literal("C"),
    v.literal("L"),
    v.literal("R"),
    v.literal("LW"),
    v.literal("RW"),
    v.literal("D"),
    v.literal("G"),
  ),
  sourceUrl: v.string(),
  sourceFetchedAt: v.number(),
  sourceSha256: v.string(),
});
function normalizeIdentityName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
function birthDay(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(timestamp) &&
      new Date(timestamp).toISOString().slice(0, 10) === value
      ? value
      : null;
  }
  const timestamp =
    typeof value === "number"
      ? value
      : /^\d+$/.test(value)
        ? Number(value)
        : Date.parse(value);
  return Number.isFinite(timestamp) &&
    timestamp >= -2208988800000 &&
    timestamp <= Date.now()
    ? new Date(timestamp).toISOString().slice(0, 10)
    : null;
}

/** Official-ID provisioning for NHL debutants. A name alone can never merge people. */
export const provisionIdentity = mutation({
  args: {
    serverSecret: v.string(),
    official: officialIdentity,
    expectedPlayerPopulation: v.array(
      v.object({
        _id: v.id("players"),
        nhlApiId: v.optional(v.union(v.string(), v.null())),
      }),
    ),
    apply: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    authorize(args.serverSecret);
    const bio = args.official;
    if (
      Object.keys(bio).some(
        (key) =>
          ![
            "nhlPlayerId",
            "firstName",
            "lastName",
            "birthDate",
            "position",
            "sourceUrl",
            "sourceFetchedAt",
            "sourceSha256",
          ].includes(key),
      ) ||
      !Number.isSafeInteger(bio.nhlPlayerId) ||
      bio.nhlPlayerId <= 0 ||
      bio.sourceUrl !==
        `https://api-web.nhle.com/v1/player/${bio.nhlPlayerId}/landing` ||
      !Number.isSafeInteger(bio.sourceFetchedAt) ||
      bio.sourceFetchedAt <= 0 ||
      bio.sourceFetchedAt > Date.now() + 300000 ||
      !/^[a-f0-9]{64}$/.test(bio.sourceSha256)
    )
      throw Error("Invalid official NHL identity provenance");
    for (const name of [bio.firstName, bio.lastName])
      if (
        !name.trim() ||
        name !== name.trim() ||
        name.length > 100 ||
        /[\u0000-\u001f\u007f]/.test(name) ||
        !normalizeIdentityName(name)
      )
        throw Error("Invalid official NHL player name");
    const date = birthDay(bio.birthDate);
    const birth = Date.parse(`${bio.birthDate}T00:00:00.000Z`);
    const ageYears = (Date.now() - birth) / (365.2425 * 86400000);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(bio.birthDate) ||
      date !== bio.birthDate ||
      !Number.isFinite(ageYears) ||
      ageYears < 15 ||
      ageYears > 100
    )
      throw Error("Invalid official NHL birth date");
    if (!["C", "L", "R", "LW", "RW", "D", "G"].includes(bio.position))
      throw Error("Invalid official NHL role");
    const players = await ctx.db.query("players").take(5001);
    const minimal = players.map((player) => ({
      _id: player._id,
      ...(player.nhlApiId === undefined ? {} : { nhlApiId: player.nhlApiId }),
    }));
    if (
      players.length > 5000 ||
      args.expectedPlayerPopulation.length > 5000 ||
      population(minimal) !== population(args.expectedPlayerPopulation)
    )
      throw Error("Canonical NHL identity population snapshot changed");
    const token = String(bio.nhlPlayerId),
      assigned = players.filter((player) => player.nhlApiId === token);
    if (assigned.length > 1)
      throw Error("Ambiguous assigned NHL player identity");
    if (assigned.length === 1)
      return {
        action: "existing" as const,
        playerId: assigned[0]!._id,
        player: { _id: assigned[0]!._id, nhlApiId: token },
        apply: args.apply ?? false,
      };
    const fullName = `${bio.firstName} ${bio.lastName}`,
      normalized = normalizeIdentityName(fullName);
    const names = players.filter(
      (player) => normalizeIdentityName(player.fullName) === normalized,
    );
    if (names.length > 1)
      throw Error(
        "Ambiguous normalized NHL player name requires identity review",
      );
    const posGroup =
      bio.position === "G" ? "G" : bio.position === "D" ? "D" : "F";
    const candidate = names[0];
    if (candidate) {
      if (
        (candidate.nhlApiId !== undefined &&
          candidate.nhlApiId !== null &&
          candidate.nhlApiId !== "") ||
        birthDay(candidate.birthday) !== date ||
        candidate.posGroup !== posGroup
      )
        throw Error(
          "Existing name requires independent exact birth date and role identity review",
        );
      if (args.apply) await ctx.db.patch(candidate._id, { nhlApiId: token });
      return {
        action: "link" as const,
        playerId: candidate._id,
        player: {
          _id: candidate._id,
          nhlApiId: args.apply ? token : (candidate.nhlApiId ?? null),
        },
        apply: args.apply ?? false,
      };
    }
    const document = {
      nhlApiId: token,
      firstName: bio.firstName,
      lastName: bio.lastName,
      fullName,
      birthday: birth,
      posGroup,
      nhlPos: [
        bio.position === "L"
          ? "LW"
          : bio.position === "R"
            ? "RW"
            : bio.position,
      ],
      isActive: true,
      isSignable: false,
      isResignable: false,
    };
    const playerId = args.apply
      ? await ctx.db.insert("players", document)
      : null;
    return {
      action: "create" as const,
      playerId,
      player: playerId ? { _id: playerId, nhlApiId: token } : null,
      apply: args.apply ?? false,
    };
  },
});
function validatePlayer(fields: Infer<typeof playerFields>) {
  const required =
    fields.posGroup === "G"
      ? ["GP", "GS", "W", "GA", "GAA", "SV", "SA", "SO", "QS", "RBS", "TOI"]
      : ["GP", "G", "A", "P", "PM", "PIM", "PPP", "SOG", "HIT", "BLK", "TOI"];
  if (
    Object.keys(fields).some((k) => !Object.hasOwn(nightlyPlayerFields, k)) ||
    Object.keys(nightlyPlayerFields).some((k) => !Object.hasOwn(fields, k))
  )
    throw Error("Complete native fields required; protected fields forbidden");
  for (const [key, value] of Object.entries(fields)) {
    if (["posGroup", "nhlPos", "nhlTeam"].includes(key)) continue;
    if (value === null && !required.includes(key)) continue;
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (key !== "PM" && value < 0) ||
      (!["TOI", "GAA", "SVP", "seasonRating"].includes(key) &&
        !Number.isSafeInteger(value))
    )
      throw Error("Invalid or incomplete native NHL statistic");
  }
  if (
    !fields.GP ||
    !["F", "D", "G"].includes(fields.posGroup) ||
    !fields.nhlPos.length ||
    !fields.nhlTeam.length
  )
    throw Error("Positive games and explicit NHL role/team required");
  if (fields.posGroup === "G") {
    if (
      fields.GS! > fields.GP ||
      fields.W! > fields.GP ||
      fields.SO! > fields.GP ||
      fields.QS! + fields.RBS! > fields.GS! ||
      fields.SV! > fields.SA! ||
      (fields.SVP === null
        ? fields.SA !== 0 || fields.SV !== 0
        : fields.SVP > 1)
    )
      throw Error("Invalid goalie exposure or save percentage");
  } else if (
    fields.P !== fields.G! + fields.A! ||
    fields.PPP! > fields.P ||
    fields.G! > fields.SOG!
  )
    throw Error("Skater totals do not reconcile");
}

export const snapshot = query({
  args: { seasonId: v.id("seasons"), serverSecret: v.string() },
  handler: async (ctx, args) => {
    authorize(args.serverSecret);
    const season = await ctx.db.get(args.seasonId);
    if (!season) throw Error("Canonical season missing");
    const [players, stats, teams, teamStats] = await Promise.all([
      ctx.db.query("players").take(5001),
      ctx.db
        .query("playerNhlStatLines")
        .withIndex("by_seasonId", (q) => q.eq("seasonId", args.seasonId))
        .take(2001),
      ctx.db.query("nhlTeams").take(65),
      ctx.db
        .query("nhlTeamSeasonStatLines")
        .withIndex("by_seasonId", (q) => q.eq("seasonId", args.seasonId))
        .take(65),
    ]);
    if (
      players.length > 5000 ||
      stats.length > 2000 ||
      teams.length > 64 ||
      teamStats.length > 64
    )
      throw Error("NHL snapshot exceeds bounded population guard");
    return {
      season,
      players: players.map((p) => ({ _id: p._id, nhlApiId: p.nhlApiId })),
      stats,
      teams,
      teamStats,
    };
  },
});

/** Bounded, non-destructive official NHL refresh. All preconditions precede writes. */
export const refreshBatch = mutation({
  args: {
    seasonId: v.id("seasons"),
    serverSecret: v.string(),
    sourceFetchedAt: v.number(),
    sourceSha256: v.string(),
    expectedSeason: v.any(),
    expectedStatsPopulation: v.array(v.any()),
    players: v.array(
      v.object({
        nhlPlayerId: v.number(),
        playerId: v.id("players"),
        expectedRow: v.any(),
        fields: playerFields,
      }),
    ),
    teams: v.array(
      v.object({
        nhlTeamId: v.id("nhlTeams"),
        abbr: v.string(),
        expectedRow: v.any(),
        fields: v.object(nightlyTeamFields),
      }),
    ),
    apply: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    authorize(args.serverSecret);
    if (
      !Number.isSafeInteger(args.sourceFetchedAt) ||
      args.sourceFetchedAt <= 0 ||
      args.sourceFetchedAt > Date.now() + 300000 ||
      !/^[a-f0-9]{64}$/.test(args.sourceSha256)
    )
      throw Error("Invalid official NHL source provenance");
    if (
      args.players.length + args.teams.length < 1 ||
      args.players.length + args.teams.length > 100 ||
      new Set(args.players.map((p) => p.playerId)).size !==
        args.players.length ||
      new Set(args.players.map((p) => p.nhlPlayerId)).size !==
        args.players.length ||
      new Set(args.teams.map((t) => t.nhlTeamId)).size !== args.teams.length
    )
      throw Error("Require 1–100 unique explicit NHL refresh rows");
    const season = await ctx.db.get(args.seasonId);
    if (!season || stable(season) !== stable(args.expectedSeason))
      throw Error("Canonical season snapshot changed");
    const current = await ctx.db
      .query("playerNhlStatLines")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", args.seasonId))
      .take(2001);
    if (
      current.length > 2000 ||
      args.expectedStatsPopulation.length > 2000 ||
      population(current) !== population(args.expectedStatsPopulation)
    )
      throw Error("NHL category population snapshot changed");
    const plans: {
      table: "playerNhlStatLines" | "nhlTeamSeasonStatLines";
      id: string | null;
      fields: Row;
      changed: boolean;
    }[] = [];
    for (const entry of args.players) {
      validatePlayer(entry.fields);
      if (!Number.isSafeInteger(entry.nhlPlayerId) || entry.nhlPlayerId <= 0)
        throw Error("Invalid NHL identity");
      const token = String(entry.nhlPlayerId);
      const players = await ctx.db
        .query("players")
        .withIndex("by_nhlApiId", (q) => q.eq("nhlApiId", token))
        .take(2);
      if (players.length !== 1 || players[0]!._id !== entry.playerId)
        throw Error("Missing or ambiguous canonical NHL player");
      const matches = current.filter((row) => row.playerId === entry.playerId);
      if (matches.length > 1)
        throw Error("Duplicate canonical NHL season stat line");
      const row = matches[0] ?? null;
      if (stable(row) !== stable(entry.expectedRow))
        throw Error("NHL player row snapshot changed");
      if (
        row?.nhlStatsSourceFetchedAt &&
        row.nhlStatsSourceFetchedAt > args.sourceFetchedAt
      )
        throw Error("Older NHL player source refused");
      const sources = await ctx.db
        .query("nhlSeasonValues")
        .withIndex("by_identity", (q) =>
          q
            .eq("seasonId", args.seasonId)
            .eq("gameType", 2)
            .eq("profile", "core")
            .eq("modelVersion", MODEL)
            .eq("nhlPlayerId", entry.nhlPlayerId),
        )
        .take(2);
      if (sources.length > 1) throw Error("Ambiguous reviewed hockey source");
      const source = sources[0];
      let hockeyRating: Infer<typeof nhlStatLineHockeyRating> = {
        modelVersion: MODEL,
        units: "goals-above-same-position-reference",
        nhlPlayerId: entry.nhlPlayerId,
        identityResolution: "canonical",
        seasonValue: null,
        rank: null,
        qualification: "missing-source",
        reasons: [
          "stale-nhl-hockey-source: No matching reviewed source for this official native-stat snapshot.",
        ],
      };
      if (source) {
        validateSeasonValue(source, MODEL);
        if (
          source.playerId !== entry.playerId ||
          source.nhlSeason !==
            Number(`${Number(season.year) - 1}${season.year}`)
        )
          throw Error("Reviewed hockey source identity or season mismatch");
        // Native TOI is recorded to two decimal minutes. A source's official-minute
        // coverage must reproduce that same value; uncertain exposure is withheld.
        const officialMinutes =
          Math.round(
            source.minutes *
              source.hockeyOverall!.coverage.officialMinutes *
              100,
          ) / 100;
        const unchanged =
          row !== null &&
          Object.keys(nightlyPlayerFields)
            .filter((k) => !["seasonRating", "nhlTeam", "nhlPos"].includes(k))
            .every(
              (k) =>
                stable(row[k as keyof typeof row]) ===
                stable(entry.fields[k as keyof typeof entry.fields]),
            );
        const existingAssociation = row?.hockeyRating;
        const matchesSource =
          unchanged &&
          existingAssociation?.sourceId === source._id &&
          ![
            "missing-source",
            "source-stat-mismatch",
            "unresolved-player",
          ].includes(existingAssociation.qualification) &&
          source.games === entry.fields.GP &&
          source.position === entry.fields.posGroup &&
          officialMinutes === Math.round(entry.fields.TOI! * 100) / 100;
        hockeyRating = {
          ...hockeyRating,
          sourceId: source._id,
          sourceFetchedAt: source.sourceFetchedAt,
          sourceGames: source.games,
          sourcePosition: source.position,
          ...(matchesSource
            ? {
                seasonValue: source.seasonValue,
                rank: source.rank,
                qualification: source.hockeyOverall!.qualification,
                reasons: [...source.missing, ...source.hockeyOverall!.warnings],
              }
            : {}),
        };
      }
      const fields = {
        ...entry.fields,
        seasonId: args.seasonId,
        playerId: entry.playerId,
        hockeyRating,
        nhlStatsSourceFetchedAt: args.sourceFetchedAt,
        nhlStatsSourceSha256: args.sourceSha256,
      };
      const changed =
        !row ||
        Object.entries(fields).some(
          ([k, x]) => stable(row[k as keyof typeof row]) !== stable(x),
        );
      plans.push({
        table: "playerNhlStatLines",
        id: row?._id ?? null,
        fields,
        changed,
      });
    }
    for (const entry of args.teams) {
      const team = await ctx.db.get(entry.nhlTeamId);
      const identities = await ctx.db
        .query("nhlTeams")
        .withIndex("by_abbr", (q) => q.eq("abbr", entry.abbr))
        .take(2);
      if (
        team?.abbr !== entry.abbr ||
        identities.length !== 1 ||
        identities[0]!._id !== team._id
      )
        throw Error("Missing or ambiguous canonical NHL team");
      if (
        Object.keys(entry.fields).length !==
          Object.keys(nightlyTeamFields).length ||
        Object.entries(entry.fields).some(
          ([k, x]) =>
            !Object.hasOwn(nightlyTeamFields, k) ||
            !Number.isSafeInteger(x) ||
            x < 0,
        ) ||
        entry.fields.GP !==
          entry.fields.W + entry.fields.L + entry.fields.OTL ||
        entry.fields.P !== entry.fields.W * 2 + entry.fields.OTL
      )
        throw Error("Invalid NHL team summary");
      const matches = await ctx.db
        .query("nhlTeamSeasonStatLines")
        .withIndex("by_seasonId_nhlTeamId", (q) =>
          q.eq("seasonId", args.seasonId).eq("nhlTeamId", entry.nhlTeamId),
        )
        .take(2);
      if (matches.length > 1)
        throw Error("Duplicate NHL team season stat line");
      const row = matches[0] ?? null;
      if (stable(row) !== stable(entry.expectedRow))
        throw Error("NHL team row snapshot changed");
      if (row && row.sourceFetchedAt > args.sourceFetchedAt)
        throw Error("Older NHL team source refused");
      const fields = {
        ...entry.fields,
        seasonId: args.seasonId,
        nhlTeamId: entry.nhlTeamId,
        sourceFetchedAt: args.sourceFetchedAt,
        sourceSha256: args.sourceSha256,
      };
      const changed =
        !row ||
        Object.entries(fields).some(
          ([k, x]) => stable(row[k as keyof typeof row]) !== stable(x),
        );
      plans.push({
        table: "nhlTeamSeasonStatLines",
        id: row?._id ?? null,
        fields,
        changed,
      });
    }
    const rows = [];
    if (args.apply)
      for (const plan of plans) {
        let id = plan.id;
        if (plan.changed) {
          if (id) await ctx.db.patch(id as never, plan.fields);
          else id = await ctx.db.insert(plan.table, plan.fields as never);
        }
        rows.push({ table: plan.table, row: await ctx.db.get(id! as never) });
      }
    return {
      apply: args.apply ?? false,
      matched: plans.length,
      changed: plans.filter((p) => p.changed).length,
      updated: args.apply ? plans.filter((p) => p.changed).length : 0,
      rows,
    };
  },
});
