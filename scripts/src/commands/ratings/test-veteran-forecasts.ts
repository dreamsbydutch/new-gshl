import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  adjustVeteranForecast,
  veteranEvidence,
  type VeteranProfile,
  type VeteranExample,
} from "../../runtime/veteran-forecast";
type Row = Record<string, any>;
const { values } = parseArgs({
  options: {
    forecasts: { type: "string" },
    source: { type: "string" },
    directory: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help)
  console.log(
    "Offline veteran forecast test. --forecasts <derived forecasts.json> --source <draft source.json> --directory <linked player directory.json> --output <NEW directory>. Fits corrections to earlier completed forecast errors only. No database/API writes; exports derived variants and diagnostics.",
  );
else {
  if (
    !values.forecasts ||
    !values.source ||
    !values.directory ||
    !values.output
  )
    throw new Error("All paths required");
  const read = async (p: string) => JSON.parse(await readFile(p, "utf8"));
  const [forecast, source, directory] = await Promise.all([
    read(values.forecasts),
    read(values.source),
    read(values.directory),
  ]);
  const ids = new Map<number, string>(
      directory.players.map((r: Row) => [Number(r.nhlApiId), r.id]),
    ),
    years = new Map<string, number>(
      source.seasonRows.map((r: Row) => [r.id, Number(r.year)]),
    );
  const records = new Map<string, Row>(
    source.playerNhlRows.map((r: Row) => [
      `${years.get(r.seasonId)! - 1}:${r.playerId}`,
      r,
    ]),
  );
  const maxYear = Math.max(
    ...source.playerNhlRows.map((r: Row) => years.get(r.seasonId)! - 1),
  );
  const raw = forecast.variants.find((r: Row) => r.method === "position-best")
    .predictions as Row[];
  const profiles = new Map<string, VeteranProfile>();
  for (const r of raw) {
    const key = `${r.origin}:${r.playerId}`;
    if (profiles.has(key)) continue;
    const id = ids.get(r.playerId),
      a = records.get(`${r.origin}:${id}`),
      b = records.get(`${r.origin - 1}:${id}`);
    if (!a) continue;
    profiles.set(key, {
      playerId: r.playerId,
      origin: r.origin,
      position: r.position,
      age: Number(a.age),
      games: r.originGames,
      priorGames: Number(b?.GP || 0),
      pointsPerGame: Number(a.P || 0) / Math.max(1, Number(a.GP)),
      priorPointsPerGame: Number(b?.P || 0) / Math.max(1, Number(b?.GP || 0)),
      current: Object.fromEntries(
        ["G", "A", "PPP", "SOG", "HIT", "BLK"].map((k) => [
          k,
          (Number(a[k] || 0) * r.originGames) / Math.max(1, Number(a.GP)),
        ]),
      ) as VeteranProfile["current"],
    });
  }
  const examples: VeteranExample[] = [];
  for (const r of raw) {
    const profile = profiles.get(`${r.origin}:${r.playerId}`);
    if (
      !profile ||
      r.origin + r.horizon > maxYear ||
      [2019, 2020].includes(r.origin + r.horizon)
    )
      continue;
    const a = records.get(`${r.origin + r.horizon}:${ids.get(r.playerId)}`),
      actual = Object.fromEntries(
        ["GP", "G", "A", "PPP", "SOG", "HIT", "BLK"].map((k) => [
          k,
          Number(a?.[k] || 0),
        ]),
      ) as VeteranExample["actual"];
    examples.push({
      ...profile,
      horizon: r.horizon,
      targetYear: r.origin + r.horizon,
      predicted: r.prediction,
      actual,
    });
  }
  const actual = new Map(
    examples.map((r) => [`${r.origin}:${r.horizon}:${r.playerId}`, r.actual]),
  );
  const evaluated: Row[] = [],
    variants = [];
  for (const mode of [
    "availability",
    "availability-and-rates",
    "retention",
  ] as const) {
    const predictions: Row[] = raw.map((r) => {
      const profile = profiles.get(`${r.origin}:${r.playerId}`),
        result = profile
          ? adjustVeteranForecast(
              profile,
              r.horizon,
              r.prediction,
              examples,
              mode,
            )
          : { prediction: r.prediction, audit: null };
      const target = actual.get(`${r.origin}:${r.horizon}:${r.playerId}`);
      if (profile && target && r.origin >= 2020 && veteranEvidence(profile) > 0)
        evaluated.push({
          origin: r.origin,
          horizon: r.horizon,
          playerId: r.playerId,
          name: r.name,
          age: profile.age,
          strength: veteranEvidence(profile),
          mode,
          baseline: r.prediction,
          prediction: result.prediction,
          actual: target,
          audit: result.audit,
        });
      return {
        ...r,
        prediction: result.prediction,
        veteranAudit: result.audit,
      };
    });
    variants.push({ method: `veteran-${mode}`, predictions });
  }
  const summary = [
    "availability",
    "availability-and-rates",
    "retention",
  ].flatMap((mode) =>
    [1, 2, 3].map((horizon) => {
      const rows = evaluated.filter(
        (r) => r.mode === mode && r.horizon === horizon && r.strength >= 0.375,
      );
      const metric = (key: string) => {
        const val = (r: Row, field: string) =>
          key === "P" ? r[field].G + r[field].A : r[field][key];
        return {
          category: key,
          n: rows.length,
          baselineRMSE: Math.sqrt(
            rows.reduce(
              (s, r) => s + (val(r, "baseline") - val(r, "actual")) ** 2,
              0,
            ) / rows.length,
          ),
          candidateRMSE: Math.sqrt(
            rows.reduce(
              (s, r) => s + (val(r, "prediction") - val(r, "actual")) ** 2,
              0,
            ) / rows.length,
          ),
          baselineBias:
            rows.reduce(
              (s, r) => s + val(r, "baseline") - val(r, "actual"),
              0,
            ) / rows.length,
          candidateBias:
            rows.reduce(
              (s, r) => s + val(r, "prediction") - val(r, "actual"),
              0,
            ) / rows.length,
        };
      };
      return {
        mode,
        horizon,
        metrics: ["GP", "P", "G", "A", "PPP", "SOG", "HIT", "BLK"].map(metric),
      };
    }),
  );
  await mkdir(values.output);
  await writeFile(
    resolve(values.output, "forecasts.json"),
    JSON.stringify({
      ...forecast,
      preferredVeteranMethod: "veteran-retention",
      variants: [...forecast.variants, ...variants],
    }),
    { flag: "wx" },
  );
  await writeFile(
    resolve(values.output, "validation.json"),
    JSON.stringify({
      summary,
      evaluated,
      limitations: [
        "Signed corrections learned only from targets completed by origin; departures included as zero GP. Active-game rates fit only active outcomes.",
        "Forward-only correction; sustained production gate uses two consecutive observed seasons. No named-player exceptions.",
        "Similarity-weighted residuals cap each player's total influence and shrink toward no correction; repeated seasons are not independent.",
        "Historical targets are reconstructed database totals. Previously examined small veteran cohorts do not establish prospective certainty.",
      ],
    }),
    { flag: "wx" },
  );
  console.log(
    JSON.stringify(
      {
        summary: summary.map((r) => ({
          ...r,
          metrics: r.metrics.filter((m) => ["GP", "P"].includes(m.category)),
        })),
        sample: variants[2]!.predictions
          .filter(
            (r) => r.origin === 2025 && [8471675, 8471214].includes(r.playerId),
          )
          .map((r) => ({
            name: r.name,
            horizon: r.horizon,
            GP: r.prediction.GP,
            P: r.prediction.P,
            audit: r.veteranAudit,
          })),
      },
      null,
      2,
    ),
  );
}
