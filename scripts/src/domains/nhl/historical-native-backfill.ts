type Row = Record<string, unknown>;
export const HISTORICAL_NHL_SEASONS = [
  20082009, 20092010, 20102011, 20112012, 20122013,
] as const;

/** Metadata is derived from completed official regular-season games, never fantasy dates. */
export function planHistoricalNhlMetadata(input: {
  season: number;
  games: readonly Row[];
  officialTeams: readonly Row[];
  requiredTeams: readonly { nhlTeamAbbr: string; officialTeamId: number }[];
  seasons: readonly Row[];
  teams: readonly Row[];
}) {
  if (!HISTORICAL_NHL_SEASONS.some((s) => s === input.season))
    throw Error("Unsupported historical NHL season");
  const start = Math.floor(input.season / 10000),
    end = input.season % 10000;
  if (!input.games.length)
    throw Error("Official completed game calendar is empty");
  const ids = new Set<number>();
  const dates = input.games
    .map((game) => {
      if (
        !Number.isSafeInteger(game.id) ||
        ids.has(Number(game.id)) ||
        game.season !== input.season ||
        game.gameType !== 2 ||
        game.gameStateId !== 7
      )
        throw Error("Invalid/duplicate/incomplete official game calendar");
      ids.add(Number(game.id));
      const day = String(game.gameDate);
      const time = Date.parse(`${day}T00:00:00Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
        !Number.isFinite(time) ||
        new Date(time).toISOString().slice(0, 10) !== day ||
        day < `${start}-07-01` ||
        day >= `${end}-07-01`
      )
        throw Error("Invalid official season date");
      return day;
    })
    .sort();
  const candidates = input.seasons.filter(
    (s) => String(s.year) === String(end),
  );
  if (candidates.length > 1) throw Error("Ambiguous canonical season year");
  const document = {
    nhlOnly: true,
    year: String(end),
    name: `${start}-${String(end).slice(-2)}`,
    categories: [],
    rosterSpots: [],
    startDate: dates[0]!,
    endDate: dates.at(-1)!,
    isActive: false,
    usesLegacyTies: false,
    signingEndDate: null,
    draftStartAt: null,
  };
  const existing = candidates[0];
  if (
    existing &&
    Object.entries(document).some(
      ([key, value]) => JSON.stringify(existing[key]) !== JSON.stringify(value),
    )
  )
    throw Error(
      "Existing season is not the exact historical NHL-only calendar",
    );
  const seenTeams = new Set<string>();
  const teams = input.requiredTeams.map((required) => {
    if (
      !/^[A-Z]{2,3}$/.test(required.nhlTeamAbbr) ||
      seenTeams.has(required.nhlTeamAbbr) ||
      !Number.isSafeInteger(required.officialTeamId) ||
      required.officialTeamId <= 0
    )
      throw Error("Invalid/duplicate official club");
    seenTeams.add(required.nhlTeamAbbr);
    const official = input.officialTeams.filter(
      (t) =>
        t.id === required.officialTeamId &&
        (t.triCode === required.nhlTeamAbbr ||
          t.rawTricode === required.nhlTeamAbbr),
    );
    if (
      official.length !== 1 ||
      typeof official[0]!.fullName !== "string" ||
      !official[0]!.fullName.trim()
    )
      throw Error("Official club identity evidence missing/ambiguous");
    const matches = input.teams.filter((t) => t.abbr === required.nhlTeamAbbr);
    if (matches.length > 1)
      throw Error("Ambiguous canonical NHL club abbreviation");
    return {
      action: matches.length ? ("existing" as const) : ("insert" as const),
      existingId: matches[0]?._id ?? null,
      officialTeamId: required.officialTeamId,
      document: {
        abbr: required.nhlTeamAbbr,
        name: official[0]!.fullName,
        logoUrl: "",
      },
    };
  });
  if (!teams.length) throw Error("No official clubs");
  return {
    season: input.season,
    gameCount: ids.size,
    seasonOperation: {
      action: existing ? ("existing" as const) : ("insert" as const),
      existingId: existing?._id ?? null,
      document,
    },
    teams,
  };
}
