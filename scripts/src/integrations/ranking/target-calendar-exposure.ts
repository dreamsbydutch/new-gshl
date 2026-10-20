import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HockeyDataCache } from "../nhl/game-value-source";
import { parsePlayerDayCalendarExposure } from "../../domains/ranking/player-day-calendar-exposure";

type Row = Record<string, unknown>;
type Source = { bytes: Uint8Array; retrievedAt: string };
type SourceProof = { url: string; sha256: string; retrievedAt: string };
type Game = {
  id: number;
  date: string;
  home: number;
  away: number;
  gameType: number;
};
export type TargetCalendarExposureOptions = {
  /** Immutable public source cache, partitioned by observation date by default. */
  cacheDirectory?: string;
  readSource?: (url: string) => Promise<Source>;
};
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const dayMs = 864e5;
const digest = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const object = (x: unknown): x is Row =>
  x !== null && typeof x === "object" && !Array.isArray(x);
const id = (r: Row) => String(r._id ?? r.id ?? "");
function dateKey(value: unknown): string {
  const day =
    value instanceof Date
      ? value.toISOString().slice(0, 10)
      : typeof value === "number"
        ? new Date(value).toISOString().slice(0, 10)
        : value;
  if (
    typeof day !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(Date.parse(day)) ||
    new Date(day).toISOString().slice(0, 10) !== day
  )
    throw Error("Canonical target calendar date required");
  return day;
}
const addDays = (date: string, days: number) =>
  new Date(Date.parse(date) + days * dayMs).toISOString().slice(0, 10);
const positiveInt = (x: unknown): x is number =>
  typeof x === "number" && Number.isSafeInteger(x) && x > 0;

function parseGame(input: unknown, date: string, season: number): Game {
  if (
    !object(input) ||
    !positiveInt(input.id) ||
    !positiveInt(input.gameType) ||
    !object(input.homeTeam) ||
    !object(input.awayTeam) ||
    !positiveInt(input.homeTeam.id) ||
    !positiveInt(input.awayTeam.id) ||
    input.homeTeam.id === input.awayTeam.id ||
    Math.floor(input.id / 1e6) !== Math.floor(season / 10000) ||
    Math.floor(input.id / 10000) % 100 !== input.gameType ||
    (input.season !== undefined && input.season !== season)
  )
    throw Error("Invalid or mixed-season official target schedule game");
  return {
    id: input.id,
    date,
    home: input.homeTeam.id,
    away: input.awayTeam.id,
    gameType: input.gameType,
  };
}

/** Target-only schedule expansion. Never changes fitted history or inspects player performances. */
export async function ensureTargetCalendarExposure(
  baseSidecar: unknown,
  canonicalWeeks: readonly Row[],
  seasons: readonly Row[],
  days: readonly Row[],
  options: TargetCalendarExposureOptions = {},
): Promise<Row> {
  const base = parsePlayerDayCalendarExposure(baseSidecar);
  if (!object(baseSidecar) || !Array.isArray(baseSidecar.weeks))
    throw Error("Known calendar sidecar required");
  const weeks = new Map<string, Row>();
  for (const week of canonicalWeeks) {
    if (!id(week) || weeks.has(id(week)))
      throw Error("Unique canonical target weeks required");
    weeks.set(id(week), week);
  }
  const seasonMap = new Map<string, Row>();
  for (const season of seasons) {
    if (!id(season) || seasonMap.has(id(season)))
      throw Error("Unique canonical target seasons required");
    seasonMap.set(id(season), season);
  }
  const baseWeeks = new Map(base.map((w) => [w.weekId, w]));
  const missing = new Map<
    string,
    { weekId: string; startDate: string; endDate: string; nhlSeason: number }
  >();
  for (const day of days) {
    if (Number(day.GP) !== 1) continue;
    const weekId = String(day.weekId ?? ""),
      week = weeks.get(weekId);
    if (
      !week ||
      day.seasonId !== week.seasonId ||
      !seasonMap.has(String(week.seasonId))
    )
      throw Error("Played target row has unknown week or season");
    const startDate = dateKey(week.startDate),
      endDate = dateKey(week.endDate),
      playedDate = dateKey(day.date);
    const duration = (Date.parse(endDate) - Date.parse(startDate)) / dayMs + 1;
    if (
      duration < 1 ||
      duration > 35 ||
      playedDate < startDate ||
      playedDate > endDate
    )
      throw Error("Invalid played target week/date or excessive duration");
    const existing = baseWeeks.get(weekId);
    if (existing) {
      if (existing.startDate !== startDate || existing.endDate !== endDate)
        throw Error(
          "Frozen calendar dates disagree with canonical target week",
        );
      continue;
    }
    const year = Number(seasonMap.get(String(week.seasonId))!.year);
    if (!Number.isSafeInteger(year) || year < 2000 || year > 2100)
      throw Error("Canonical NHL target season year required");
    missing.set(weekId, {
      weekId,
      startDate,
      endDate,
      nhlSeason: (year - 1) * 10000 + year,
    });
  }
  if (!missing.size) return baseSidecar;

  const directory =
    options.cacheDirectory ??
    resolve(
      root,
      ".local-data/gshl-uniform-impact-20261020/target-calendar-cache",
      new Date().toISOString().slice(0, 10),
    );
  const cache = new HockeyDataCache(directory);
  const readSource =
    options.readSource ??
    (async (url: string): Promise<Source> => {
      const bytes = await cache.bytes(url);
      const meta = JSON.parse(
        await readFile(resolve(directory, digest(url) + ".json"), "utf8"),
      ) as Row;
      if (
        meta.url !== url ||
        meta.sha256 !== digest(bytes) ||
        typeof meta.fetchedAt !== "string"
      )
        throw Error("Target calendar cache provenance mismatch");
      return { bytes, retrievedAt: meta.fetchedAt };
    });
  const sourceMap = new Map<string, SourceProof>();
  async function source(url: string): Promise<Row> {
    const result = await readSource(url);
    if (!Number.isFinite(Date.parse(result.retrievedAt)))
      throw Error("Target schedule retrieval instant required");
    const value: unknown = JSON.parse(
      Buffer.from(result.bytes).toString("utf8"),
    );
    if (!object(value)) throw Error("Official target schedule object required");
    const proof = {
      url,
      sha256: digest(result.bytes),
      retrievedAt: result.retrievedAt,
    };
    const previous = sourceMap.get(url);
    if (previous && previous.sha256 !== proof.sha256)
      throw Error("Official target schedule changed within calculation");
    sourceMap.set(url, proof);
    return value;
  }
  const teamSets = new Map<number, Set<number>>();
  const additions: Row[] = [];
  for (const target of missing.values()) {
    const urls: string[] = [];
    let leagueTeams = teamSets.get(target.nhlSeason);
    const clubUrl = `https://api-web.nhle.com/v1/club-schedule-season/TOR/${target.nhlSeason}`;
    urls.push(clubUrl);
    if (!leagueTeams) {
      const club = await source(clubUrl);
      if (!Array.isArray(club.games))
        throw Error("Full official TOR season schedule required");
      const games = club.games
        .filter((g) => object(g) && g.gameType === 2)
        .map((g) =>
          parseGame(g, dateKey((g as Row).gameDate), target.nhlSeason),
        );
      // A division-only or partial season cannot establish league-wide membership.
      const dates = games.map((g) => g.date).sort();
      if (
        (club.currentSeason !== undefined &&
          club.currentSeason !== target.nhlSeason) ||
        ![82, 84].includes(games.length) ||
        new Set(games.map((g) => g.id)).size !== games.length ||
        games.some((g) => g.home !== 10 && g.away !== 10) ||
        !dates.length ||
        (Date.parse(dates.at(-1)!) - Date.parse(dates[0]!)) / dayMs < 150 ||
        dates[0]! < `${Math.floor(target.nhlSeason / 10000)}-09-01` ||
        dates[0]! > `${Math.floor(target.nhlSeason / 10000)}-11-01` ||
        dates.at(-1)! < `${target.nhlSeason % 10000}-03-01` ||
        dates.at(-1)! > `${target.nhlSeason % 10000}-05-31`
      )
        throw Error(
          "Full interconference 82/84-game TOR season schedule required for target league membership",
        );
      leagueTeams = new Set(games.flatMap((g) => [g.home, g.away]));
      if (leagueTeams.size < 31 || leagueTeams.size > 40)
        throw Error("Incomplete target NHL league membership");
      teamSets.set(target.nhlSeason, leagueTeams);
    }
    const games = new Map<number, Game>();
    for (
      let cursor = target.startDate;
      cursor <= target.endDate;
      cursor = addDays(cursor, 7)
    ) {
      const url = `https://api-web.nhle.com/v1/schedule/${cursor}`;
      urls.push(url);
      const page = await source(url);
      if (!Array.isArray(page.gameWeek))
        throw Error("Official target week schedule required");
      const dates = new Map<string, unknown[]>();
      for (const d of page.gameWeek) {
        if (!object(d) || !Array.isArray(d.games))
          throw Error("Invalid target schedule day");
        const date = dateKey(d.date);
        if (dates.has(date))
          throw Error("Duplicate official target schedule date");
        dates.set(date, d.games);
      }
      for (
        let date = cursor;
        date <= target.endDate && date < addDays(cursor, 7);
        date = addDays(date, 1)
      ) {
        const rows = dates.get(date);
        if (!rows) throw Error("Incomplete official target week date coverage");
        for (const row of rows) {
          if (!object(row) || !positiveInt(row.gameType))
            throw Error("Invalid official target game type");
          if (row.gameType !== 2) continue;
          const game = parseGame(row, date, target.nhlSeason);
          if (!leagueTeams.has(game.home) || !leagueTeams.has(game.away))
            throw Error("Target game outside verified NHL league membership");
          const previous = games.get(game.id);
          if (previous && JSON.stringify(previous) !== JSON.stringify(game))
            throw Error("Conflicting duplicate target NHL game");
          games.set(game.id, game);
        }
      }
    }
    if (!games.size)
      throw Error("Positive official target NHL schedule exposure required");
    additions.push({
      ...target,
      scheduledLeagueGames: games.size,
      leagueTeamCount: leagueTeams.size,
      meanGamesPerNhlTeam: (2 * games.size) / leagueTeams.size,
      gameIds: [...games.keys()].sort((a, b) => a - b),
      sources: urls.map((url) => sourceMap.get(url)!),
      observationPolicy:
        "Target-only official schedule as observed at calculation, including future scheduled regular-season games and all statuses. Not an archived pre-week forecast; no owner/player outcomes enter exposure.",
    });
  }
  const expanded = {
    ...baseSidecar,
    weeks: [...baseSidecar.weeks, ...additions],
  };
  parsePlayerDayCalendarExposure(expanded);
  return expanded;
}
