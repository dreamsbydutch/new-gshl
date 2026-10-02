import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { impactBreakdown } from "../../runtime/nhl-impact-breakdown";
import type { ImpactModel } from "../../runtime/nhl-adjusted-impact";
import type { GameSeasonRating } from "../../runtime/nhl-game-season-value";

const { values } = parseArgs({
  options: {
    input: { type: "string", multiple: true },
    output: { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help)
  console.log(
    "Audit saved fitted NHL game-value reports. --input <ratings.json> (repeat for multiple seasons) --output <NEW directory>. Reads calculated model coefficients and exposure breakdowns locally; no API/DB access or production writes. Exports goal-unit offense/defense, not separate normalized percentiles.",
  );
else {
  if (!values.input?.length || !values.output)
    throw new Error("Input reports and a new output directory required");
  const reports = [];
  for (const path of values.input) {
    const report = JSON.parse(await readFile(resolve(path), "utf8")) as {
      model: ImpactModel;
      ratings: GameSeasonRating[];
      season: number;
      qualityGate?: { passes: boolean };
    };
    if (!report.model?.coefficients || !Array.isArray(report.ratings))
      throw new Error(`Not a fitted game-value report: ${path}`);
    const qualified =
      report.qualityGate?.passes === true && report.model.converged;
    const rows = report.ratings
      .filter((p) => p.position !== "G")
      .map((p) => {
        const breakdown = impactBreakdown(
          report.model,
          p.playerId,
          p.situations,
        );
        const error = Math.abs(breakdown.total - p.components.adjustedProcess);
        if (!Number.isFinite(error) || error > 0.000051)
          throw new Error(
            `Process reconciliation failed for ${p.playerId}: ${error}`,
          );
        return {
          playerId: p.playerId,
          season: report.season,
          name: p.name,
          position: p.position,
          status: !qualified && p.status === "rated" ? "provisional" : p.status,
          games: p.games,
          minutes: p.minutes,
          seasonValue: p.seasonValue,
          seasonRank: qualified ? p.seasonRank : null,
          offense: breakdown.offense,
          defense: breakdown.defense,
          finishing: p.components.finishing,
          penalties: p.components.penalties,
          byStrength: breakdown.byStrength,
          reconciliationError: error,
        };
      });
    reports.push({
      input: resolve(path),
      qualityGatePassed: qualified,
      players: rows.length,
      maximumReconciliationError: Math.max(
        0,
        ...rows.map((p) => p.reconciliationError),
      ),
      rows,
    });
  }
  const output = resolve(values.output);
  await mkdir(output);
  await writeFile(
    resolve(output, "defense-audit.json"),
    JSON.stringify(
      {
        interpretation:
          "One estimated goal prevented equals one estimated goal created. Defense is conditional on recorded lineups and shot quality, not a complete measure of off-puck skill. No ranking changes or production writes.",
        reports,
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  const columns = [
    "report",
    "season",
    "playerId",
    "name",
    "position",
    "status",
    "games",
    "minutes",
    "seasonValue",
    "seasonRank",
    "offense",
    "defense",
    "finishing",
    "penalties",
  ] as const;
  const csvRows = reports.flatMap((report) =>
    report.rows.map((row) => ({ report: report.input, ...row })),
  );
  const csv =
    [
      columns.join(","),
      ...csvRows.map((row) =>
        columns
          .map((key) => {
            const value = row[key];
            return value === null
              ? ""
              : `"${String(value).replaceAll('"', '""')}"`;
          })
          .join(","),
      ),
    ].join("\n") + "\n";
  await writeFile(resolve(output, "defense-audit.csv"), csv, { flag: "wx" });
  console.log(
    JSON.stringify({
      reports: reports.length,
      skaterSeasons: csvRows.length,
      output,
    }),
  );
}
