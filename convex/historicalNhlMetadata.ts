import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

const seasonFields = {
  nhlOnly: v.literal(true),
  year: v.string(),
  name: v.string(),
  categories: v.array(v.string()),
  rosterSpots: v.array(v.string()),
  startDate: v.string(),
  endDate: v.string(),
  isActive: v.literal(false),
  usesLegacyTies: v.literal(false),
  signingEndDate: v.null(),
  draftStartAt: v.null(),
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}

function population(rows: readonly Record<string, unknown>[]) {
  return stable(
    [...rows].sort((a, b) => String(a._id).localeCompare(String(b._id))),
  );
}

/** Authenticated operator only. All metadata additions commit in one transaction. */
export const provision = internalMutation({
  args: {
    expectedSeasons: v.array(v.any()),
    expectedTeams: v.array(v.any()),
    seasons: v.array(v.object(seasonFields)),
    teams: v.array(
      v.object({
        officialTeamId: v.number(),
        abbr: v.string(),
        name: v.string(),
        logoUrl: v.literal(""),
      }),
    ),
    sourceSha256s: v.array(v.string()),
    apply: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const [seasons, teams] = await Promise.all([
      ctx.db.query("seasons").take(101),
      ctx.db.query("nhlTeams").take(101),
    ]);
    if (
      seasons.length > 100 ||
      teams.length > 100 ||
      population(seasons) !== population(args.expectedSeasons) ||
      population(teams) !== population(args.expectedTeams)
    )
      throw Error("Historical NHL metadata inventory changed");
    if (
      args.seasons.length !== 5 ||
      args.sourceSha256s.length !== 5 ||
      args.sourceSha256s.some((hash) => !/^[a-f0-9]{64}$/.test(hash)) ||
      new Set(args.seasons.map((s) => s.year)).size !== 5 ||
      args.teams.length > 2 ||
      new Set(args.teams.map((t) => t.abbr)).size !== args.teams.length
    )
      throw Error("Exact historical NHL metadata scope required");
    const seasonPlan = args.seasons.map((document) => {
      const year = Number(document.year);
      if (
        !Number.isInteger(year) ||
        year < 2009 ||
        year > 2013 ||
        document.year !== String(year) ||
        document.name !== `${year - 1}-${String(year).slice(-2)}` ||
        document.categories.length ||
        document.rosterSpots.length ||
        ![document.startDate, document.endDate].every((date) => {
          const timestamp = Date.parse(`${date}T00:00:00Z`);
          return (
            /^\d{4}-\d{2}-\d{2}$/.test(date) &&
            Number.isFinite(timestamp) &&
            new Date(timestamp).toISOString().slice(0, 10) === date &&
            date >= `${year - 1}-07-01` &&
            date < `${year}-07-01`
          );
        }) ||
        document.startDate > document.endDate
      )
        throw Error("Invalid historical NHL-only season");
      const matches = seasons.filter((s) => Number(s.year) === year);
      if (
        matches.length > 1 ||
        (matches[0] &&
          Object.entries(document).some(
            ([key, value]) =>
              stable(matches[0]![key as keyof (typeof matches)[number]]) !==
              stable(value),
          ))
      )
        throw Error("Conflicting historical NHL season");
      return { document, existingId: matches[0]?._id ?? null };
    });
    const teamPlan = args.teams.map(({ officialTeamId, ...document }) => {
      if (
        !(
          (officialTeamId === 11 &&
            document.abbr === "ATL" &&
            document.name === "Atlanta Thrashers") ||
          (officialTeamId === 27 &&
            document.abbr === "PHX" &&
            document.name === "Phoenix Coyotes")
        )
      )
        throw Error("Unsupported historical NHL club identity");
      const matches = teams.filter((team) => team.abbr === document.abbr);
      if (
        matches.length > 1 ||
        (matches[0] && matches[0].name !== document.name)
      )
        throw Error("Conflicting historical NHL club");
      return { document, existingId: matches[0]?._id ?? null };
    });
    const result = {
      apply: args.apply ?? false,
      insertedSeasons: seasonPlan.filter((s) => !s.existingId).length,
      insertedTeams: teamPlan.filter((t) => !t.existingId).length,
      seasons: [] as Array<{ nhlSeason: number; seasonId: string | null }>,
      teams: [] as Array<{ abbr: string; teamId: string | null }>,
    };
    // Validate every operation before issuing any write.
    for (const entry of seasonPlan) {
      const seasonId =
        entry.existingId ??
        (args.apply ? await ctx.db.insert("seasons", entry.document) : null);
      const year = Number(entry.document.year);
      result.seasons.push({ nhlSeason: (year - 1) * 10000 + year, seasonId });
    }
    for (const entry of teamPlan) {
      const teamId =
        entry.existingId ??
        (args.apply ? await ctx.db.insert("nhlTeams", entry.document) : null);
      result.teams.push({ abbr: entry.document.abbr, teamId });
    }
    return result;
  },
});
