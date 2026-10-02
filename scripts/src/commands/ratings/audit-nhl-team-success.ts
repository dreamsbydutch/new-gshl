import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { HockeyDataCache } from "../../integrations/nhl/game-value-source";
import { withNhlSourceCache } from "../../integrations/nhl/source-workspace";
import { parseNhlReportPage } from "../../integrations/nhl/season-rating-source";
import type { GameSeasonRating } from "../../runtime/nhl-game-season-value";
import type { ImpactModel } from "../../runtime/nhl-adjusted-impact";
import { impactBreakdown } from "../../runtime/nhl-impact-breakdown";
import { rankNhlPerformance } from "../../runtime/nhl-performance-rating";
import {
  allocateTeamValue,
  aggregateTeamValue,
  type TeamContribution,
  type TeamResult,
  type SeriesResult,
  type TeamRating,
} from "../../domains/ranking/nhl-team-success";

const { values } = parseArgs({
  options: {
    manifest: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
  },
});
const n = (row: Record<string, unknown>, key: string) => {
  const value = row[key];
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`Missing numeric ${key}`);
  return value;
};
if (values.help)
  console.log(
    "Read-only team validation. --manifest <defense-audit.json listing saved fitted report paths> --output <NEW directory>. Reads official NHL regular/playoff summaries, team-filtered player TOI and playoff brackets. API responses use an automatically removed temporary workspace. Saves only derived team/player contributions, results, provenance and coverage. No Convex writes or rating changes.",
  );
else {
  if (!values.manifest || !values.output)
    throw new Error("Manifest and output required");
  const manifest = JSON.parse(
    await readFile(resolve(values.manifest), "utf8"),
  ) as { reports: { input: string }[] };
  const reports = new Map<
    number,
    {
      model: ImpactModel;
      ratings: GameSeasonRating[];
      qualityGate: { passes: boolean };
    }
  >();
  const hashes: Record<string, string> = {};
  for (const item of manifest.reports) {
    const text = await readFile(item.input, "utf8");
    const report = JSON.parse(text) as {
      season: number;
      gameType: number;
      version: string;
      model: ImpactModel;
      ratings: GameSeasonRating[];
      qualityGate: { passes: boolean };
    };
    if (
      report.gameType !== 2 ||
      report.version !== "nhl-season-value-v3" ||
      reports.has(report.season)
    )
      throw new Error("Invalid/duplicate regular season report");
    reports.set(report.season, report);
    hashes[String(report.season)] = createHash("sha256")
      .update(text)
      .digest("hex");
  }
  const seasons = [...reports.keys()].sort((a, b) => a - b),
    first = seasons[0]!,
    last = seasons.at(-1)!;
  const output = resolve(values.output);
  await mkdir(output);
  await withNhlSourceCache(undefined, async (directory) => {
    const cache = new HockeyDataCache(directory),
      urls: string[] = [];
    async function stats(
      kind: string,
      report: string,
      gameType: number,
      teamId?: number,
    ) {
      const rows: Record<string, unknown>[] = [];
      let expected: number | undefined;
      for (let start = 0; start < 10000; start += 100) {
        const params = new URLSearchParams({
          isAggregate: "false",
          isGame: "false",
          start: String(start),
          limit: "100",
          sort: JSON.stringify([
            { property: "seasonId", direction: "ASC" },
            {
              property: kind === "team" ? "teamId" : "playerId",
              direction: "ASC",
            },
          ]),
          cayenneExp: `seasonId>=${first} and seasonId<=${last} and gameTypeId=${gameType}${teamId === undefined ? "" : ` and teamId=${teamId}`}`,
        });
        const url = `https://api.nhle.com/stats/rest/en/${kind}/${report}?${params}`;
        urls.push(url);
        const page = parseNhlReportPage(await cache.json(url));
        if (expected !== undefined && page.total !== expected)
          throw new Error("Source changed during pagination");
        expected = page.total;
        rows.push(...page.data);
        if (rows.length === expected) return rows;
        if (!page.data.length || rows.length > expected)
          throw new Error("Incomplete source pagination");
      }
      throw new Error("Source scope exceeded");
    }
    const regular = await stats("team", "summary", 2),
      playoffs = await stats("team", "summary", 3);
    const teams: TeamResult[] = regular
      .filter((r) => reports.has(n(r, "seasonId")))
      .map((r) => {
        const season = n(r, "seasonId"),
          teamId = n(r, "teamId"),
          p = playoffs.find(
            (p) => p.seasonId === season && p.teamId === teamId,
          );
        return {
          season,
          teamId,
          name: String(r.teamFullName),
          games: n(r, "gamesPlayed"),
          wins: n(r, "wins"),
          losses: n(r, "losses"),
          otLosses: n(r, "otLosses"),
          points: n(r, "points"),
          regulationWins: n(r, "winsInRegulation"),
          goalsFor: n(r, "goalsFor"),
          goalsAgainst: n(r, "goalsAgainst"),
          playoffGames: p ? n(p, "gamesPlayed") : 0,
          playoffWins: p ? n(p, "wins") : 0,
          playoffLosses: p ? n(p, "losses") : 0,
        };
      });
    const contributions: TeamContribution[] = [],
      missing: Array<{
        season: number;
        teamId: number;
        playerId: number;
        minutes: number;
      }> = [];
    const ids = [...new Set(teams.map((t) => t.teamId))].sort((a, b) => a - b);
    for (const teamId of ids) {
      for (const [kind, reportName] of [
        ["skater", "timeonice"],
        ["goalie", "summary"],
      ]) {
        const rows = await stats(kind!, reportName!, 2, teamId);
        for (const row of rows) {
          const season = n(row, "seasonId");
          if (!reports.has(season)) continue;
          if (!teams.some((t) => t.season === season && t.teamId === teamId))
            throw new Error("Roster outside historical team scope");
          const playerId = n(row, "playerId"),
            minutes = n(row, "timeOnIce") / 60,
            games = n(row, "gamesPlayed");
          const report = reports.get(season)!,
            player = report.ratings.find((p) => p.playerId === playerId);
          if (!player || player.seasonValue === null) {
            missing.push({ season, teamId, playerId, minutes });
            continue;
          }
          if ((kind === "goalie") !== (player.position === "G"))
            throw new Error("Player position conflict");
          const split = impactBreakdown(
            report.model,
            playerId,
            player.situations,
          );
          contributions.push(
            allocateTeamValue(
              season,
              teamId,
              player,
              minutes,
              games,
              split.offense,
              split.defense,
            ),
          );
        }
      }
      console.log(
        JSON.stringify({
          teamId,
          completed: ids.indexOf(teamId) + 1,
          teams: ids.length,
          contributions: contributions.length,
        }),
      );
    }
    const exposureErrors: Array<{
      season: number;
      playerId: number;
      expected: number;
      actual: number;
    }> = [];
    for (const [season, report] of reports)
      for (const p of report.ratings) {
        const actual = contributions
          .filter((r) => r.season === season && r.playerId === p.playerId)
          .reduce((n, r) => n + r.minutes, 0);
        if (Math.abs(actual - p.minutes) > 0.051)
          exposureErrors.push({
            season,
            playerId: p.playerId,
            expected: p.minutes,
            actual,
          });
      }
    const series: SeriesResult[] = [];
    for (const season of seasons) {
      const url = `https://api-web.nhle.com/v1/playoff-bracket/${season % 10000}`;
      urls.push(url);
      const bracket = await cache.json<{
        series: Array<{
          playoffRound: number;
          topSeedTeam?: { id: number };
          bottomSeedTeam?: { id: number };
          winningTeamId?: number;
        }>;
      }>(url);
      for (const s of bracket.series ?? [])
        if (s.winningTeamId && s.topSeedTeam && s.bottomSeedTeam)
          series.push({
            season,
            round: s.playoffRound,
            top: s.topSeedTeam.id,
            bottom: s.bottomSeedTeam.id,
            winner: s.winningTeamId,
          });
    }
    const teamRatings: TeamRating[] = teams.map((team) => ({
      ...aggregateTeamValue(
        team,
        contributions.filter(
          (r) => r.season === team.season && r.teamId === team.teamId,
        ),
      ),
      performance: null,
    }));
    for (const [season, report] of reports) {
      const seasonTeams = teams.filter((t) => t.season === season);
      // Avoid inventing a common season length for COVID's unequal team schedules.
      if (
        !report.qualityGate.passes ||
        new Set(seasonTeams.map((t) => t.games)).size !== 1
      )
        continue;
      const performance = rankNhlPerformance(
        report.ratings.map((p) => ({
          ...p,
          teamSeasonGames: seasonTeams[0]!.games,
        })),
      );
      for (const t of teamRatings.filter((t) => t.season === season)) {
        const parts = contributions.filter(
          (r) => r.season === season && r.teamId === t.teamId,
        );
        // Low-sample players remain moderated; incomplete rows are separately reported.
        const weights = parts.map((r) => ({
          minutes: r.minutes,
          score:
            performance.find((p) => p.playerId === r.playerId)
              ?.performanceRating ?? 50,
        }));
        t.performance =
          weights.reduce((n, r) => n + r.minutes * r.score, 0) / t.minutes;
      }
    }
    const result = {
      generatedAt: new Date().toISOString(),
      sourceHashes: hashes,
      sourceUrls: urls,
      allocation:
        "Season goal value allocated by official team-specific TOI; this is not stint-specific realized contribution. Team value is goals above modeled baseline per team game.",
      provisionalSeasons: seasons.filter(
        (s) => !reports.get(s)!.qualityGate.passes,
      ),
      missing,
      exposureErrors,
      teams: teamRatings,
      contributions,
      series,
    };
    await writeFile(
      resolve(output, "team-success-input.json"),
      JSON.stringify(result, null, 2),
      { flag: "wx" },
    );
    console.log(
      JSON.stringify({
        seasons: seasons.length,
        teams: teamRatings.length,
        series: series.length,
        missing: missing.length,
        exposureErrors: exposureErrors.length,
        output,
      }),
    );
    if (exposureErrors.length || missing.some((r) => r.minutes > 0))
      throw new Error(
        "Coverage mismatch: results retained for diagnosis, do not interpret correlations yet",
      );
  });
}
