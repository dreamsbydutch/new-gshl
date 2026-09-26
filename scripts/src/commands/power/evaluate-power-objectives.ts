import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  buildPreseasonProjections,
  standardized,
} from "../../runtime/preseason-projection";
import { projectOwners } from "../../runtime/owner-projection";
import type { DatabaseRecord as Row } from "../../integrations/data/records";
import {
  evaluateMatchupWeights,
  type WeeklyEvaluationHistory,
} from "../../domains/power/evaluate-matchup-weights";

type Source = {
  seasonRows: Row[];
  draftPickRows: Row[];
  playerNhlRows: Row[];
  teamSeasonRows: Row[];
};
type Directory = { teams: Row[]; franchises: Row[] };
const { values } = parseArgs({
  options: { help: { type: "boolean" }, fetch: { type: "boolean" } },
});
if (values.help) {
  console.log(
    "Evaluate final-standings and next-matchup objectives from local history. --fetch additionally reads production Week, Matchup and TeamWeekStatLine rows for completed 2019–2026 seasons. Never mutates league data.",
  );
} else {
  const directory = resolve("../.local-data/power-objectives");
  await mkdir(directory, { recursive: true });
  const source = JSON.parse(
    await readFile(
      resolve("../.local-data/draft-slot-research/source.json"),
      "utf8",
    ),
  ) as Source;
  const identities = JSON.parse(
    await readFile(
      resolve("../.local-data/draft-signings-source.json"),
      "utf8",
    ),
  ) as Directory;
  const candidates = [0, 0.25, 0.5, 0.75, 1];
  const correlation = (a: number[], b: number[]) =>
    standardized(a).reduce(
      (sum, score, index) => sum + score * standardized(b)[index]!,
      0,
    ) / a.length;
  const ranks = (scores: number[]) =>
    scores.map(
      (score) =>
        1 +
        scores.filter((other) => other > score).length +
        (scores.filter((other) => other === score).length - 1) / 2,
    );
  const results: {
    year: number;
    teams: number;
    candidates: {
      ownerWeight: number;
      rankCorrelation: number;
      rankMAE: number;
    }[];
  }[] = [];
  for (const season of source.seasonRows.filter(
    (row) => Number(row.year) >= 2019 && Number(row.year) <= 2026,
  )) {
    const actual = source.teamSeasonRows.filter(
      (row) =>
        row.seasonId === season.id &&
        row.seasonType === "RS" &&
        Number(row.GP) > 0,
    );
    const picks = source.draftPickRows.filter(
      (row) => row.seasonId === season.id && row.playerId && row.gshlTeamId,
    );
    if (actual.length < 6 || !picks.length) continue;
    const teams = actual.map(
      (row) =>
        identities.teams.find((team) => team.id === row.gshlTeamId) ?? {
          id: row.gshlTeamId,
        },
    );
    const roster = buildPreseasonProjections({
      season,
      seasons: source.seasonRows,
      teams,
      rosters: picks,
      playerNhlRows: source.playerNhlRows,
    });
    const owners = projectOwners({
      season,
      seasons: source.seasonRows,
      teams,
      historicalTeams: identities.teams,
      franchises: identities.franchises,
      teamSeasons: source.teamSeasonRows,
    });
    const standings = actual.map((row) => Number(row.overallRk));
    if (standings.some((rank) => !Number.isFinite(rank) || rank < 1))
      throw new Error(`Missing final standings in ${String(season.year)}`);
    results.push({
      year: Number(season.year),
      teams: teams.length,
      candidates: candidates.map((ownerWeight) => {
        const scores = teams.map(
          (team) =>
            (1 - ownerWeight) *
              roster.find((row) => row.teamId === team.id)!.score +
            ownerWeight * owners.get(String(team.id))!.score,
        );
        const order = ranks(scores);
        return {
          ownerWeight,
          rankCorrelation: correlation(order, standings),
          rankMAE:
            order.reduce(
              (sum, rank, index) => sum + Math.abs(rank - standings[index]!),
              0,
            ) / teams.length,
        };
      }),
    });
  }
  const summarize = (rows: typeof results) =>
    candidates.map((ownerWeight) => {
      const selected = rows.map(
        (row) =>
          row.candidates.find(
            (candidate) => candidate.ownerWeight === ownerWeight,
          )!,
      );
      return {
        ownerWeight,
        rankCorrelation:
          selected.reduce((sum, row) => sum + row.rankCorrelation, 0) /
          rows.length,
        rankMAE:
          selected.reduce((sum, row) => sum + row.rankMAE, 0) / rows.length,
      };
    });
  const report = {
    selectionMetric:
      "minimum mean final-standings rank MAE on training seasons only",
    selectedOwnerWeight: [
      ...summarize(results.filter((row) => row.year <= 2023)),
    ].sort((a, b) => a.rankMAE - b.rankMAE)[0]!.ownerWeight,
    trainingYears: [2019, 2023],
    evaluationYears: [2024, 2026],
    training: summarize(results.filter((row) => row.year <= 2023)),
    evaluation: summarize(results.filter((row) => row.year >= 2024)),
    seasons: results,
  };
  await writeFile(
    resolve(directory, "preseason-evaluation.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (values.fetch) {
    const store = await import("../../integrations/data/convex-store");
    store.configureConvexTarget("production");
    const history: { weeks: Row[]; teamWeeks: Row[]; matchups: Row[] } = {
      weeks: [],
      teamWeeks: [],
      matchups: [],
    };
    for (const season of source.seasonRows.filter(
      (row) => Number(row.year) >= 2019 && Number(row.year) <= 2026,
    )) {
      const [weeks, teamWeeks, matchups] = await Promise.all([
        store.fetchSeasonModel<Row>("Week", String(season.id)),
        store.fetchSeasonModel<Row>("TeamWeekStatLine", String(season.id)),
        store.fetchSeasonModel<Row>("Matchup", String(season.id)),
      ]);
      history.weeks.push(...weeks);
      history.teamWeeks.push(...teamWeeks);
      history.matchups.push(...matchups);
      console.log(
        JSON.stringify({
          year: season.year,
          weeks: weeks.length,
          teamWeeks: teamWeeks.length,
          matchups: matchups.length,
        }),
      );
    }
    await writeFile(
      resolve(directory, "weekly-history.json"),
      JSON.stringify(history),
    );
  }
  const history = JSON.parse(
    await readFile(resolve(directory, "weekly-history.json"), "utf8"),
  ) as WeeklyEvaluationHistory;
  const matchups = evaluateMatchupWeights(source.seasonRows, history);
  await writeFile(
    resolve(directory, "matchup-evaluation.json"),
    JSON.stringify(matchups, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        midseasonTraining: matchups.training,
        midseasonEvaluation: matchups.evaluation,
      },
      null,
      2,
    ),
  );
}
