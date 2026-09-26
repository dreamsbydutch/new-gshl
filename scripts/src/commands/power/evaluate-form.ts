import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateFormModels } from "../../domains/power/evaluate-form-models";
import type { WeeklyEvaluationHistory } from "../../domains/power/evaluate-matchup-weights";
import type { DatabaseRecord as Row } from "../../integrations/data/records";

if (process.argv.includes("--help")) {
  console.log(
    "Local-only chronological form calibration using cached power history. Writes .local-data/power-objectives/form-evaluation.json; no network or league writes.",
  );
} else {
  const root = resolve("../.local-data");
  const source = JSON.parse(
    await readFile(resolve(root, "draft-slot-research/source.json"), "utf8"),
  ) as { seasonRows: Row[] };
  const history = JSON.parse(
    await readFile(
      resolve(root, "power-objectives/weekly-history.json"),
      "utf8",
    ),
  ) as WeeklyEvaluationHistory;
  const report = evaluateFormModels(source.seasonRows, history);
  await writeFile(
    resolve(root, "power-objectives/form-evaluation.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        selected: report.selected,
        evaluation: report.selectedEvaluation,
        baseline: report.evaluation.find(
          (r) => !r.forfeits && r.alpha === 0.72 && r.current === 0.25,
        ),
        walkForward: report.walkForward,
        baselineMaxError: Math.max(
          ...report.seasons.map((s) => s.baselineMaxError),
        ),
        skippedWeeks: report.seasons.reduce(
          (sum, row) => sum + row.skippedWeeks,
          0,
        ),
      },
      null,
      2,
    ),
  );
}
