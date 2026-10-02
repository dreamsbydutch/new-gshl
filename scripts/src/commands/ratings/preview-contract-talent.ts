import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { rankRowsWithRankingEngine } from "../../domains/ranking/ranking-engine";
import {
  projectContractTalentRating,
  type HistoricalRatingForecast,
} from "../../runtime/contract-rating-calibration";
import type { CategoryPrediction } from "../../runtime/fantasy-category-forecast";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    source: { type: "string" },
    output: { type: "string" },
    method: { type: "string", default: "category-v1" },
    help: { type: "boolean" },
  },
});
if (values.help)
  console.log(
    "Offline candidate contract ratings. --input <salary experiment directory> --source <latest saved NHL source.json> --output <NEW directory> [--method <forecast variant, default category-v1>]. Produces two/three-year talent ratings using matured chronological calibration. No salaries or production writes.",
  );
else {
  if (!values.input || !values.source || !values.output)
    throw new Error("Input, latest source and new output required");
  const input = resolve(values.input),
    output = resolve(values.output);
  const method = values.method!;
  if (!/^[a-z0-9-]+$/.test(method)) throw new Error("Invalid forecast method");
  const report = JSON.parse(
    await readFile(resolve(input, `${method}.json`), "utf8"),
  ) as {
    projections: {
      origin: number;
      horizon: number;
      playerId: number;
      name: string;
      position: string;
      prediction: CategoryPrediction;
    }[];
  };
  const evaluation = JSON.parse(
    await readFile(resolve(input, "salary-validation.json"), "utf8"),
  ) as {
    scores: HistoricalRatingForecast[];
    workloadCalibrationPositions?: string[];
  };
  if (evaluation.workloadCalibrationPositions?.length)
    throw new Error(
      "Workload-calibrated previews require origin workload inputs; use the ungrouped evaluation for this preview command",
    );
  if (!evaluation.scores.some((r) => r.method === method))
    throw new Error("Forecast method has no historical calibration evidence");
  const source = JSON.parse(await readFile(resolve(values.source), "utf8")) as {
    nhl: {
      season: number;
      goalies: {
        playerId: number;
        gamesStarted: number;
        gamesPlayed: number;
      }[];
    };
  };
  const origin = Math.floor(source.nhl.season / 10000);
  if (report.projections.some((r) => r.origin !== origin))
    throw new Error("Projection/source season mismatch");
  const shares = new Map(
    source.nhl.goalies.map((r) => [r.playerId, r.gamesStarted / r.gamesPlayed]),
  );
  const forecasts = new Map<number, number[]>();
  for (const horizon of [1, 2, 3]) {
    const pool = report.projections.filter((r) => r.horizon === horizon);
    const rows = pool.map((r) => ({
      id: String(r.playerId),
      playerId: String(r.playerId),
      seasonId: String(origin + horizon),
      seasonType: "RS",
      posGroup: r.position,
      nhlPos: r.position,
      ...r.prediction,
      GS:
        r.prediction.GP *
        (r.position === "G" ? (shares.get(r.playerId) ?? 0) : 1),
      TOI: r.prediction.MIN,
    }));
    const rated = await rankRowsWithRankingEngine(rows, {
      dataModelName: "PlayerNHL",
      dataContext: { playerNhlRows: rows },
      mutate: false,
    });
    for (const row of rated) {
      const id = Number(row.playerId),
        ratings = forecasts.get(id) ?? [];
      ratings[horizon - 1] =
        Number(row.GP) > 0 ? Number(row.seasonRating ?? 0) : 0;
      forecasts.set(id, ratings);
    }
  }
  const players = report.projections
    .filter((r) => r.horizon === 1)
    .map((r) => {
      const contract = projectContractTalentRating(
        {
          origin,
          position: r.position,
          method,
          yearlyRatings: forecasts.get(r.playerId)!,
        },
        evaluation.scores,
      );
      return {
        playerId: r.playerId,
        name: r.name,
        position: r.position,
        year1: contract.years[0]!.rating,
        year2: contract.years[1]!.rating,
        year3: contract.years[2]!.rating,
        twoYearRating: contract.twoYearRating,
        threeYearRating: contract.threeYearRating,
        calibration: contract.years.map((y) => y.calibration),
      };
    });
  const ranked = players
    .map((r) => ({
      ...r,
      twoYearPositionRank:
        1 +
        players.filter(
          (p) => p.position === r.position && p.twoYearRating > r.twoYearRating,
        ).length,
      threeYearPositionRank:
        1 +
        players.filter(
          (p) =>
            p.position === r.position && p.threeYearRating > r.threeYearRating,
        ).length,
    }))
    .sort(
      (a, b) =>
        a.position.localeCompare(b.position) ||
        a.twoYearPositionRank - b.twoYearPositionRank,
    );
  await mkdir(output);
  await writeFile(
    resolve(output, "contract-ratings.json"),
    JSON.stringify(
      {
        origin,
        forecastSeasons: [origin + 1, origin + 2, origin + 3],
        method: `${method}+calibrated`,
        state: "research-preview",
        notes: [
          "Position ranks are separate; no new salary curve is set.",
          "All three years are required; annual ratings average equally over the contract.",
          "Calibration uses only completed historical forecasts. No production ratings or salaries changed.",
        ],
        players: ranked,
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  const flat = ranked.map(({ calibration: _, ...r }) => r),
    columns = Object.keys(flat[0] ?? {}),
    cell = (x: unknown) => '"' + String(x ?? "").replaceAll('"', '""') + '"';
  await writeFile(
    resolve(output, "contract-ratings.csv"),
    "\ufeff" +
      [
        columns.map(cell).join(","),
        ...flat.map((r) =>
          columns.map((k) => cell(r[k as keyof typeof r])).join(","),
        ),
      ].join("\r\n"),
    { flag: "wx" },
  );
  console.log(JSON.stringify({ output, players: ranked.length }));
}
