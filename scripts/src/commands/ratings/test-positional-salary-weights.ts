import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import {
  fitPositionWeights,
  positionWinProbability,
  type PositionExample,
} from "../../runtime/positional-salary-weights";
import { priorWeekRoster } from "../../domains/ranking/positional-evaluation-roster";
type Row = Record<string, any>;
const { values } = parseArgs({
  options: {
    source: { type: "string" },
    history: { type: "string" },
    baseline: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
    "roster-mode": { type: "string", default: "opening" },
  },
});
if (values.help)
  console.log(
    "Offline positional scarcity-weight test. --source <draft snapshot> --history <history directory> --baseline <matchup validation.json> --output <NEW directory> [--roster-mode opening|prior-week]. Baseline must use the same roster mode. Earlier seasons only; no production writes.",
  );
else {
  if (!values.source || !values.history || !values.baseline || !values.output)
    throw new Error("All paths required");
  const source = JSON.parse(await readFile(values.source, "utf8")),
    baseline = JSON.parse(await readFile(values.baseline, "utf8"));
  if (!["opening", "prior-week"].includes(values["roster-mode"]!))
    throw new Error("Invalid roster mode");
  if ((baseline.rosterMode ?? "opening") !== values["roster-mode"])
    throw new Error("Baseline roster mode must match");
  const years = new Map<string, number>(
    source.seasonRows.map((s: Row) => [s.id, Number(s.year)]),
  );
  const examples: (PositionExample & { matchupId: string })[] = [],
    audit = [];
  for (const year of [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]) {
    const data = JSON.parse(
      await readFile(resolve(values.history, `${year}.json`), "utf8"),
    );
    const picks = source.draftPickRows.filter(
      (r: Row) => r.seasonId === data.season.id && r.playerId && r.gshlTeamId,
    );
    const teams = [...new Set<string>(picks.map((r: Row) => r.gshlTeamId))];
    if (!teams.length) continue;
    const previous = source.playerNhlRows.filter(
      (r: Row) => years.get(r.seasonId) === year - 1,
    );
    const points = new Map<string, { p: number; v: number }>();
    for (const [p, pos, slots] of [
      [0, "F", 9],
      [1, "D", 4],
      [2, "G", 2],
    ] as const) {
      const rows = previous
        .filter((r: Row) => r.posGroup === pos)
        .sort(
          (a: Row, b: Row) => Number(b.overallRating) - Number(a.overallRating),
        );
      for (let i = 0; i < rows.length; i++)
        points.set(rows[i].playerId, {
          p,
          v: Math.max(-1, 1 - (i + 1) / (teams.length * slots)),
        });
    }
    const totals = new Map<string, [number, number, number]>();
    let missing = 0;
    for (const team of teams) {
      const x: [number, number, number] = [0, 0, 0];
      for (const id of new Set(
        picks
          .filter((r: Row) => r.gshlTeamId === team)
          .map((r: Row) => r.playerId),
      )) {
        const p = points.get(String(id));
        if (p) x[p.p]! += p.v;
        else missing++;
      }
      totals.set(team, x);
    }
    const weeks = new Map<string, Row>(data.weeks.map((w: Row) => [w.id, w]));
    for (const m of data.matchups) {
      if (
        !m.isComplete ||
        weeks.get(m.weekId)?.weekType !== "RS" ||
        (!m.homeWin && !m.awayWin && !m.tie)
      )
        continue;
      const teamTotal = (team: string) => {
        if (values["roster-mode"] === "opening") return totals.get(team);
        const ids = priorWeekRoster(
          weeks.get(m.weekId)! as { id: string },
          data.weeks,
          data.playerWeeks,
          team,
          picks
            .filter((r: Row) => r.gshlTeamId === team)
            .map((r: Row) => String(r.playerId)),
        );
        const x: [number, number, number] = [0, 0, 0];
        for (const id of ids) {
          const p = points.get(id);
          if (p) x[p.p]! += p.v;
        }
        return x;
      };
      const a = teamTotal(m.homeTeamId),
        b = teamTotal(m.awayTeamId);
      if (!a || !b) continue;
      examples.push({
        year,
        matchupId: m.id,
        x: a.map((v, i) => v - b[i]!) as [number, number, number],
        actual: m.homeWin ? 1 : m.awayWin ? 0 : 0.5,
      });
    }
    audit.push({
      year,
      teams: teams.length,
      missing,
      latestInputYear: year - 1,
    });
  }
  const predictions: Row[] = [],
    fits = [];
  for (const year of [2021, 2022, 2023, 2024, 2025, 2026])
    for (const individual of [false, true]) {
      const model = fitPositionWeights(examples, year, individual),
        method = individual ? "learned-position" : "equal-scarcity";
      fits.push({ year, method, ...model });
      for (const r of examples.filter((r) => r.year === year))
        predictions.push({
          ...r,
          method,
          prediction: positionWinProbability(r.x, model),
        });
    }
  const raw = baseline.predictions.filter(
    (r: Row) => r.method === "raw-rating",
  );
  for (const r of raw)
    if (predictions.some((p) => p.matchupId === r.matchupId))
      predictions.push(r);
  function summarize(rows: Row[]) {
    return ["raw-rating", "equal-scarcity", "learned-position"].map(
      (method) => {
        const p = rows.filter((r) => r.method === method);
        return {
          method,
          n: p.length,
          brier:
            p.reduce((s, r) => s + (r.prediction - r.actual) ** 2, 0) /
            p.length,
          accuracy:
            p.reduce(
              (s, r) =>
                s +
                (r.actual === 0.5
                  ? 0.5
                  : Number(r.prediction >= 0.5 === (r.actual === 1))),
              0,
            ) / p.length,
        };
      },
    );
  }
  const report = {
    rosterMode: values["roster-mode"],
    audit,
    fits,
    training: summarize(predictions.filter((r) => r.year <= 2023)),
    heldOut: summarize(predictions.filter((r) => r.year >= 2024)),
    years: [2021, 2022, 2023, 2024, 2025, 2026].map((year) => ({
      year,
      metrics: summarize(predictions.filter((r) => r.year === year)),
    })),
    latestFit: fitPositionWeights(examples, 2027, true),
    predictions,
    limitations: [
      "Position ranks use previous-season stored talent ratings, not the latest experimental category forecaster. Transfer to the new forecaster needs validation.",
      "Ranks are scaled to a fixed 9F/4D/2G roster benchmark. Individual coefficients shrink toward a common fitted coefficient with fixed penalty 25. No nonpositive position weights.",
      "Repeated teams and weeks are dependent; three later evaluation seasons cannot establish a perfect balance. Rosters are used for evaluation only; prior-week mode selects greatest non-IR ownership exposure, not exact closing ownership.",
    ],
  };
  await mkdir(values.output);
  await writeFile(
    resolve(values.output, "validation.json"),
    JSON.stringify(report, null, 2),
    { flag: "wx" },
  );
  console.log(
    JSON.stringify(
      {
        training: report.training,
        heldOut: report.heldOut,
        latestFit: report.latestFit,
        years: report.years,
      },
      null,
      2,
    ),
  );
}
