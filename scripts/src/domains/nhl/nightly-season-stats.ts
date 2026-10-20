import { indexNhlRows, type NhlStatRow } from "./season-rating-input";

export type NightlyScheduleGame = {
  id: number;
  season: number;
  gameType: number;
  gameState: string;
  gameScheduleState: string;
};
export type NativeNhlPlayer = {
  nhlPlayerId: number;
  name: string;
  fields: Record<string, number | string | string[] | null>;
};

export function validateNhlNightlyScope(date: string, season: number) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date ||
    !Number.isInteger(season) ||
    Math.floor(season / 10000) + 1 !== season % 10000
  )
    throw Error("Invalid nightly NHL date/season");
}

/** Explicitly postponed/cancelled games do not block a verified season snapshot. */
export function nightlyNhlReadiness(
  games: NightlyScheduleGame[],
  season: number,
) {
  if (
    new Set(games.map((g) => g.id)).size !== games.length ||
    games.some(
      (g) =>
        !Number.isSafeInteger(g.id) ||
        !Number.isSafeInteger(g.season) ||
        !Number.isInteger(g.gameType) ||
        typeof g.gameState !== "string" ||
        typeof g.gameScheduleState !== "string",
    )
  )
    throw Error("Invalid nightly NHL schedule");
  const relevant = games.filter((g) => [2, 3].includes(g.gameType));
  if (relevant.some((g) => g.season !== season))
    throw Error("NHL schedule season mismatch");
  const excluded = relevant.filter(
    (g) =>
      ["PPD", "CNCL"].includes(g.gameScheduleState) ||
      ["PPD", "CNCL"].includes(g.gameState),
  );
  const excludedIds = new Set(excluded.map((g) => g.id));
  const active = relevant.filter((g) => !excludedIds.has(g.id));
  const unfinished = active.filter(
    (g) =>
      !["OFF", "FINAL"].includes(g.gameState) || g.gameScheduleState !== "OK",
  );
  return {
    ready: unfinished.length === 0,
    reason: !active.length
      ? "no-games"
      : unfinished.length
        ? "games-not-final"
        : "all-games-final",
    gameIds: active.map((g) => g.id).sort((a, b) => a - b),
    excludedIds: [...excludedIds].sort((a, b) => a - b),
    unfinishedIds: unfinished.map((g) => g.id),
  };
}

function n(row: NhlStatRow, key: string, signed = false): number {
  const value = row[key];
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (!signed && value < 0)
  )
    throw Error(`Missing/invalid official ${key}`);
  return value;
}
function count(row: NhlStatRow, key: string, signed = false) {
  const value = n(row, key, signed);
  if (!Number.isSafeInteger(value)) throw Error(`Noninteger official ${key}`);
  return value;
}
const statKeys = [
  "GP",
  "GS",
  "G",
  "A",
  "P",
  "PM",
  "PIM",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
  "W",
  "GA",
  "GAA",
  "SV",
  "SA",
  "SVP",
  "SO",
  "QS",
  "RBS",
  "TOI",
];

/** Exact NHL-ID joins and per-game goalie reconciliation; no missing-to-zero conversion. */
export function normalizeNightlyNhlPlayers(input: {
  season: number;
  skaters: NhlStatRow[];
  timeonice: NhlStatRow[];
  realtime: NhlStatRow[];
  goalies: NhlStatRow[];
  goalieGames: NhlStatRow[];
  completedGameIds: number[];
}): NativeNhlPlayer[] {
  const { season } = input;
  const skaters = indexNhlRows(input.skaters, season),
    times = indexNhlRows(input.timeonice, season);
  const realtime = indexNhlRows(input.realtime, season),
    goalies = indexNhlRows(input.goalies, season);
  if (
    !skaters.size ||
    !goalies.size ||
    skaters.size !== times.size ||
    skaters.size !== realtime.size
  )
    throw Error("Incomplete official NHL season population");
  const out: NativeNhlPlayer[] = [];
  const blank = () =>
    Object.fromEntries(
      statKeys.map((k) => [k, null]),
    ) as NativeNhlPlayer["fields"];
  const metadata = (r: NhlStatRow, goalie: boolean) => {
    const pos = goalie ? "G" : String(r.positionCode);
    if (
      !["C", "L", "R", "D", "G"].includes(pos) ||
      (!goalie && pos === "G") ||
      typeof r.teamAbbrevs !== "string" ||
      !r.teamAbbrevs.trim()
    )
      throw Error("Invalid official NHL position/team");
    return {
      nhlPos: [pos === "L" ? "LW" : pos === "R" ? "RW" : pos],
      posGroup: pos === "G" ? "G" : pos === "D" ? "D" : "F",
      nhlTeam: r.teamAbbrevs.split(",").map((x) => x.trim()),
    };
  };
  for (const [id, r] of skaters) {
    const t = times.get(id),
      rt = realtime.get(id);
    if (
      !t ||
      !rt ||
      t.gamesPlayed !== r.gamesPlayed ||
      rt.gamesPlayed !== r.gamesPlayed ||
      goalies.has(id)
    )
      throw Error("NHL identity/exposure source mismatch");
    const f = {
      ...blank(),
      ...metadata(r, false),
      GP: count(r, "gamesPlayed"),
      G: count(r, "goals"),
      A: count(r, "assists"),
      P: count(r, "points"),
      PM: count(r, "plusMinus", true),
      PIM: count(r, "penaltyMinutes"),
      PPP: count(r, "ppPoints"),
      SOG: count(r, "shots"),
      HIT: count(rt, "hits"),
      BLK: count(rt, "blockedShots"),
      TOI: n(t, "timeOnIce") / 60,
    };
    if (f.GP <= 0 || f.G + f.A !== f.P)
      throw Error("Invalid official skater totals");
    out.push({ nhlPlayerId: id, name: String(r.skaterFullName), fields: f });
  }
  const ids = new Set(input.completedGameIds);
  if (ids.size !== input.completedGameIds.length)
    throw Error("Duplicate completed NHL games");
  const seen = new Set<string>(),
    starts = new Map<number, number>();
  const totals = new Map<
    number,
    {
      GP: number;
      GS: number;
      SV: number;
      SA: number;
      GA: number;
      QS: number;
      RBS: number;
    }
  >();
  let leagueSV = 0,
    leagueSA = 0;
  for (const r of goalies.values()) {
    leagueSV += count(r, "saves");
    leagueSA += count(r, "shotsAgainst");
  }
  for (const r of input.goalieGames) {
    const game = count(r, "gameId"),
      id = count(r, "playerId"),
      key = `${game}:${id}`;
    if (
      (r.seasonId !== undefined && r.seasonId !== season) ||
      !ids.has(game) ||
      !goalies.has(id) ||
      seen.has(key) ||
      r.gamesPlayed !== 1 ||
      ![0, 1].includes(Number(r.gamesStarted))
    )
      throw Error("Invalid official goalie-game identity");
    seen.add(key);
    const gs = count(r, "gamesStarted"),
      sv = count(r, "saves"),
      sa = count(r, "shotsAgainst"),
      ga = count(r, "goalsAgainst");
    if (sv > sa) throw Error("Invalid official goalie save counts");
    starts.set(game, (starts.get(game) ?? 0) + gs);
    const v = totals.get(id) ?? {
      GP: 0,
      GS: 0,
      SV: 0,
      SA: 0,
      GA: 0,
      QS: 0,
      RBS: 0,
    };
    v.GP++;
    v.GS += gs;
    v.SV += sv;
    v.SA += sa;
    v.GA += ga;
    if (gs && sa > 0) {
      const pct = sv / sa;
      if (
        (leagueSA > 0 && pct >= leagueSV / leagueSA) ||
        (sa <= 20 && pct >= 0.885)
      )
        v.QS++;
      if (pct < 0.85) v.RBS++;
    }
    totals.set(id, v);
  }
  if ([...ids].some((id) => starts.get(id) !== 2))
    throw Error("Official completed game missing two goalie starters");
  for (const [id, r] of goalies) {
    const t = totals.get(id);
    if (
      !t ||
      Object.entries({
        GP: "gamesPlayed",
        GS: "gamesStarted",
        SV: "saves",
        SA: "shotsAgainst",
        GA: "goalsAgainst",
      }).some(([k, v]) => t[k as keyof typeof t] !== count(r, v))
    )
      throw Error("Goalie season/game totals changed or incomplete");
    const svp = r.savePct;
    if (!(t.SA === 0 && t.SV === 0 && svp === null)) n(r, "savePct");
    const f = {
      ...blank(),
      ...metadata(r, true),
      ...t,
      G: count(r, "goals"),
      A: count(r, "assists"),
      P: count(r, "points"),
      PIM: count(r, "penaltyMinutes"),
      W: count(r, "wins"),
      SO: count(r, "shutouts"),
      GAA: n(r, "goalsAgainstAverage"),
      SVP: svp as number | null,
      TOI: n(r, "timeOnIce") / 60,
    };
    if (t.GP <= 0 || f.G + f.A !== f.P || f.W > t.GP || f.SO > t.GP)
      throw Error("Invalid goalie totals");
    out.push({ nhlPlayerId: id, name: String(r.goalieFullName), fields: f });
  }
  return out.sort((a, b) => a.nhlPlayerId - b.nhlPlayerId);
}

export function normalizeNightlyNhlTeams(
  rows: NhlStatRow[],
  directory: NhlStatRow[],
  season: number,
  completedGames: number,
) {
  const byId = new Map(directory.map((r) => [r.id, r]));
  if (byId.size !== directory.length)
    throw Error("Duplicate NHL team directory");
  const seen = new Set<number>();
  const out = rows.map((r) => {
    const id = count(r, "teamId"),
      team = byId.get(id);
    if (
      r.seasonId !== season ||
      seen.has(id) ||
      !team ||
      typeof team.triCode !== "string" ||
      !team.triCode
    )
      throw Error("Invalid NHL team summary identity");
    seen.add(id);
    const f = {
      GP: count(r, "gamesPlayed"),
      W: count(r, "wins"),
      L: count(r, "losses"),
      OTL: count(r, "otLosses"),
      P: count(r, "points"),
      GF: count(r, "goalsFor"),
      GA: count(r, "goalsAgainst"),
    };
    if (f.GP !== f.W + f.L + f.OTL)
      throw Error("NHL team record does not reconcile");
    return { nhlTeamAbbr: team.triCode, officialTeamId: id, fields: f };
  });
  if (
    !out.length ||
    out.reduce((n, r) => n + r.fields.GP, 0) !== 2 * completedGames
  )
    throw Error("NHL team/game totals changed or incomplete");
  return out;
}
