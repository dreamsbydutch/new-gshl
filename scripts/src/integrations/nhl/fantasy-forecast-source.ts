import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { HockeyDataCache } from "./game-value-source";
import { withNhlSourceCache } from "./source-workspace";
import { parseNhlReportPage } from "./season-rating-source";
import type { NhlRatingSource } from "../../domains/nhl/season-rating-input";
import {
  zeroTotals,
  type CategorySeason,
} from "../../runtime/fantasy-category-forecast";

/** Existing snapshots supply summary/TOI. Fresh official realtime/bios are temporary. */
export async function loadFantasyForecastSource(
  baseline: string,
  teamAudit: string,
  log: (s: string) => void,
) {
  return withNhlSourceCache(undefined, async (directory) => {
    const cache = new HockeyDataCache(directory);
    const provenance: { source: string; sha256: string }[] = [];
    const read = async (path: string) => {
      const text = await readFile(path, "utf8");
      provenance.push({
        source: path,
        sha256: createHash("sha256").update(text).digest("hex"),
      });
      return JSON.parse(text);
    };
    async function report(
      kind: string,
      name: string,
      aggregate: boolean,
      first = 20132014,
      last = 20252026,
    ) {
      const rows: Record<string, unknown>[] = [];
      let expected: number | undefined;
      for (let start = 0; start < 20000; start += 100) {
        const params = new URLSearchParams({
          isAggregate: String(aggregate),
          isGame: "false",
          start: String(start),
          limit: "100",
          sort: JSON.stringify(
            aggregate
              ? [{ property: "playerId", direction: "ASC" }]
              : [
                  { property: "seasonId", direction: "ASC" },
                  { property: "playerId", direction: "ASC" },
                ],
          ),
          cayenneExp: `seasonId>=${first} and seasonId<=${last} and gameTypeId=2`,
        });
        const url = `https://api.nhle.com/stats/rest/en/${kind}/${name}?${params}`;
        const bytes = await cache.bytes(url);
        provenance.push({
          source: url,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
        const page = parseNhlReportPage(JSON.parse(bytes.toString("utf8")));
        if (page.total >= 10000)
          throw new Error(
            "NHL report reached API result ceiling; narrow the season range",
          );
        if (expected !== undefined && expected !== page.total)
          throw new Error("Source pagination changed");
        expected = page.total;
        rows.push(...page.data);
        if (start % 2000 === 0)
          log(`${kind}/${name}: ${rows.length}/${expected}`);
        if (rows.length === expected) return rows;
        if (!page.data.length || rows.length > expected)
          throw new Error("Incomplete report");
      }
      throw new Error("Report exceeded read bound");
    }
    const realtime = [
      ...(await report("skater", "realtime", false, 20132014, 20182019)),
      ...(await report("skater", "realtime", false, 20192020, 20252026)),
    ];
    const bios = [
      ...(await report("skater", "bios", true)),
      ...(await report("goalie", "bios", true)),
    ];
    const realtimeById = new Map<string, Record<string, unknown>>();
    for (const r of realtime) {
      const key = `${r.seasonId}:${r.playerId}`;
      if (realtimeById.has(key)) throw new Error("Duplicate realtime identity");
      realtimeById.set(key, r);
    }
    const births = new Map<number, string>();
    for (const b of bios) {
      const id = Number(b.playerId),
        birth = String(b.birthDate);
      if (births.has(id) && births.get(id) !== birth)
        throw new Error("Conflicting birthdate");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birth))
        throw new Error("Missing birthdate");
      births.set(id, birth);
    }
    const audit = (await read(resolve(teamAudit))) as {
      missing: unknown[];
      exposureErrors: unknown[];
      teams: { season: number; teamId: number; games: number }[];
      contributions: {
        season: number;
        playerId: number;
        teamId: number;
        games: number;
        minutes: number;
        offense: number;
        defense: number;
        finishing: number;
        saving: number;
        penalties: number;
        ability: number | null;
      }[];
    };
    if (audit.missing.length || audit.exposureErrors.length)
      throw new Error("Team schedule audit incomplete");
    const teamGames = new Map(
      audit.teams.map((t) => [`${t.season}:${t.teamId}`, t.games]),
    );
    const exposure = new Map<string, { weighted: number; games: number }>();
    const impacts = new Map<string, { minutes: number; values: number[] }>();
    for (const c of audit.contributions) {
      const key = `${c.season}:${c.playerId}`,
        e = exposure.get(key) ?? { weighted: 0, games: 0 };
      const schedule = teamGames.get(`${c.season}:${c.teamId}`);
      if (!schedule) throw new Error("Missing historical team schedule");
      e.weighted += c.games * schedule;
      e.games += c.games;
      exposure.set(key, e);
      const impact = impacts.get(key) ?? {
        minutes: 0,
        values: Array(6).fill(0),
      };
      impact.minutes += c.minutes;
      [
        c.offense,
        c.defense,
        c.finishing,
        c.saving,
        c.penalties,
        c.ability ?? 0,
      ].forEach((v, i) => {
        if (!Number.isFinite(v))
          throw new Error("Missing NHL impact component");
        impact.values[i]! += v;
      });
      impacts.set(key, impact);
    }
    const n = (row: Record<string, unknown>, key: string) => {
      const value = row[key];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
        throw new Error(`Invalid ${key}`);
      return value;
    };
    const rows: CategorySeason[] = [];
    const coverage = [];
    for (let year = 2013; year <= 2025; year++) {
      const season = year * 10000 + year + 1;
      const source = (await read(
        resolve(baseline, String(season), "source.json"),
      )) as { nhl: NhlRatingSource };
      if (source.nhl.season !== season || source.nhl.gameType !== 2)
        throw new Error("Wrong summary season");
      const summaries = [...source.nhl.skaters.summary, ...source.nhl.goalies];
      const ids = new Set<number>();
      const times = new Map(
        source.nhl.skaters.timeonice.map((r) => [Number(r.playerId), r]),
      );
      for (const r of summaries) {
        const playerId = n(r, "playerId");
        if (ids.has(playerId)) throw new Error("Duplicate source identity");
        ids.add(playerId);
        const position =
          "goalieFullName" in r ? "G" : r.positionCode === "D" ? "D" : "F";
        const birthDate = births.get(playerId),
          exp = exposure.get(`${season}:${playerId}`);
        if (!birthDate || !exp || exp.games !== r.gamesPlayed || exp.games <= 0)
          throw new Error(`Incomplete source join ${season}:${playerId}`);
        const scale = 82 / (exp.weighted / exp.games),
          totals = zeroTotals();
        totals.GP = n(r, "gamesPlayed");
        if (position === "G") {
          totals.W = n(r, "wins");
          totals.SA = n(r, "shotsAgainst");
          totals.GA = n(r, "goalsAgainst");
          totals.SV = n(r, "saves");
          totals.MIN = n(r, "timeOnIce") / 60;
          if (
            totals.SV > totals.SA ||
            (totals.SA > 0 &&
              Math.abs(totals.SV / totals.SA - n(r, "savePct")) > 0.00002) ||
            (totals.MIN > 0 &&
              Math.abs(
                (60 * totals.GA) / totals.MIN - n(r, "goalsAgainstAverage"),
              ) > 0.00002)
          )
            throw new Error("Goalie totals do not reconcile");
        } else {
          const rt = realtimeById.get(`${season}:${playerId}`),
            time = times.get(playerId);
          if (!rt || !time || rt.gamesPlayed !== r.gamesPlayed)
            throw new Error("Incomplete realtime/TOI join");
          totals.G = n(r, "goals");
          totals.A = n(r, "assists");
          totals.PPP = n(r, "ppPoints");
          totals.SOG = n(r, "shots");
          totals.HIT = n(rt, "hits");
          totals.BLK = n(rt, "blockedShots");
          totals.MIN = n(time, "timeOnIce") / 60;
          totals.PPMIN = n(time, "ppTimeOnIce") / 60;
          if (totals.G + totals.A !== r.points)
            throw new Error("Points do not reconcile");
        }
        const rawTotals = { ...totals },
          impact = impacts.get(`${season}:${playerId}`);
        for (const k of Object.keys(totals) as (keyof typeof totals)[])
          totals[k] *= scale;
        rows.push({
          year,
          playerId,
          name: String(r.skaterFullName ?? r.goalieFullName),
          position,
          birthDate,
          totals,
          rawTotals,
          rawStarts: position === "G" ? n(r, "gamesStarted") : rawTotals.GP,
          impact:
            impact && impact.minutes > 0
              ? impact.values.map((v) => (60 * v) / impact.minutes)
              : undefined,
        });
      }
      if (
        ids.size < 900 ||
        realtime.filter((r) => r.seasonId === season).length !==
          source.nhl.skaters.summary.length
      )
        throw new Error("Incomplete season population");
      coverage.push({ year, players: ids.size });
    }
    return { rows, coverage, provenance, acquiredAt: new Date().toISOString() };
  });
}
