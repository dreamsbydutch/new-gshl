import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import type { NhlSeasonRating } from "../../runtime/nhl-season-rating";
import type {
  NhlRatingSource,
  NhlStatRow,
} from "../../domains/nhl/season-rating-input";
import {
  compareRanks,
  correlation,
  spearman,
  ranks,
  parseCsv,
} from "../../domains/ranking/nhl-rating-diagnostics";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    output: { type: "string" },
    moneypuck: { type: "string" },
    help: { type: "boolean" },
  },
});
const number = (value: unknown) =>
  typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : NaN;
const mean = (values: number[]) =>
  values.reduce((s, x) => s + x, 0) / values.length;
const component = (p: NhlSeasonRating, name: string) =>
  p.components.find((c) => c.name === name)?.value ?? 0;
const componentRate = (p: NhlSeasonRating, name: string) =>
  p.components.find((c) => c.name === name)?.rate ?? NaN;
const round = (value: number) => Math.round(value * 10000) / 10000;
const rawValue = (p: NhlSeasonRating) =>
  (0.5 * p.minutes) / 1000 + p.components.reduce((sum, c) => sum + c.value, 0);

if (values.help) {
  console.log(
    "Offline quality audit: --input <multi-season reports> --output <directory> [--moneypuck <directory containing moneypuck-2024-skaters.csv and moneypuck-2024-goalies.csv>]. Produces correlations, ablations, stability and optional 2024-25 xG diagnostics. No network, production access, rating edits or weight fitting.",
  );
} else {
  if (!values.input || !values.output)
    throw new Error("--input and --output required");
  const summary = JSON.parse(
    await readFile(resolve(values.input, "summary.json"), "utf8"),
  ) as { seasons: { nhlSeason: number; name: string }[] };
  const seasons: Array<{
    nhlSeason: number;
    name: string;
    source: NhlRatingSource;
    ratings: NhlSeasonRating[];
  }> = [];
  const sourceHashes: Record<string, string> = {};
  for (const season of summary.seasons) {
    const sourceText = await readFile(
      resolve(values.input, String(season.nhlSeason), "source.json"),
      "utf8",
    );
    const ratingText = await readFile(
      resolve(values.input, String(season.nhlSeason), "ratings.json"),
      "utf8",
    );
    const source = JSON.parse(sourceText) as NhlRatingSource;
    const report = JSON.parse(ratingText) as {
      version: string;
      ratings: NhlSeasonRating[];
    };
    if (
      source.season !== season.nhlSeason ||
      source.profile !== "core" ||
      source.gameType !== 2 ||
      report.version !== "nhl-season-value-v1"
    )
      throw new Error("Unexpected model/scope");
    sourceHashes[`${season.nhlSeason}-source`] = createHash("sha256")
      .update(sourceText)
      .digest("hex");
    sourceHashes[`${season.nhlSeason}-ratings`] = createHash("sha256")
      .update(ratingText)
      .digest("hex");
    seasons.push({ ...season, source, ratings: report.ratings });
  }
  const positions = ["F", "D", "G"] as const;
  const metrics = [
    "scoring5v5",
    "territory5v5",
    "defenseEV",
    "discipline",
    "powerPlay",
    "penaltyKill",
    "saving",
  ];
  const diagnostics = seasons.flatMap((season) =>
    positions.map((position) => {
      const pool = season.ratings.filter(
        (p) => p.position === position && p.status === "rated",
      );
      const scores = pool.map((p) => p.seasonValue!);
      const summaryRows = new Map<number, NhlStatRow>(
        [...season.source.skaters.summary, ...season.source.goalies].map(
          (p) => [number(p.playerId), p],
        ),
      );
      const minutes = pool.map((p) => p.minutes);
      const impact = pool.map((p) => p.impactPer60!);
      const components = metrics
        .filter((name) =>
          pool.some((p) => p.components.some((c) => c.name === name)),
        )
        .map((name) => ({
          name,
          absoluteContribution: pool.reduce(
            (sum, p) => sum + Math.abs(component(p, name)),
            0,
          ),
          removal: compareRanks(
            scores,
            pool.map((p) => round(rawValue(p) - component(p, name))),
          ),
        }));
      const scoringOnly = pool.map((p) =>
        round(
          (0.5 * p.minutes) / 1000 +
            component(p, "scoring5v5") +
            component(p, "powerPlay"),
        ),
      );
      return {
        season: season.name,
        nhlSeason: season.nhlSeason,
        position,
        players: pool.length,
        correlations: {
          valueMinutes: spearman(scores, minutes),
          impactMinutes: spearman(impact, minutes),
          valuePoints:
            position === "G"
              ? null
              : spearman(
                  scores,
                  pool.map((p) => number(summaryRows.get(p.playerId)?.points)),
                ),
          impactPointsPer60:
            position === "G"
              ? null
              : spearman(
                  impact,
                  pool.map(
                    (p) =>
                      (number(summaryRows.get(p.playerId)?.points) * 60) /
                      p.minutes,
                  ),
                ),
        },
        components,
        baselineTotal: pool.reduce((s, p) => s + (0.5 * p.minutes) / 1000, 0),
        scoringOnly:
          position === "G" ? null : compareRanks(scores, scoringOnly),
        offsets: [0, 0.25, 1].map((offset) => ({
          offset,
          ...compareRanks(
            scores,
            pool.map((p) =>
              round(rawValue(p) + ((offset - 0.5) * p.minutes) / 1000),
            ),
          ),
        })),
        examples: pool
          .filter((p) =>
            [
              "Aleksander Barkov",
              "Anthony Cirelli",
              "Jordan Staal",
              "Jaccob Slavin",
              "Chris Tanev",
              "Gustav Forsling",
              "Connor Hellebuyck",
              "Igor Shesterkin",
              "Andrei Vasilevskiy",
            ].includes(p.name),
          )
          .map((p) => ({
            name: p.name,
            rank: p.rank,
            value: p.seasonValue,
            impact: p.impactPer60,
            components: Object.fromEntries(
              p.components.map((c) => [c.name, c.value]),
            ),
          })),
      };
    }),
  );
  const stability = seasons.slice(0, -1).flatMap((season, i) =>
    positions.map((position) => {
      const next = new Map(
        seasons[i + 1]!.ratings.filter(
          (p) => p.position === position && p.status === "rated",
        ).map((p) => [p.playerId, p]),
      );
      const matched = season.ratings.filter(
        (p) =>
          p.position === position &&
          p.status === "rated" &&
          next.has(p.playerId),
      );
      const paired = matched.map((p) => next.get(p.playerId)!);
      return {
        from: season.name,
        to: seasons[i + 1]!.name,
        position,
        matched: matched.length,
        impact: spearman(
          matched.map((p) => p.impactPer60!),
          paired.map((p) => p.impactPer60!),
        ),
        value: spearman(
          matched.map((p) => p.seasonValue!),
          paired.map((p) => p.seasonValue!),
        ),
        components: Object.fromEntries(
          metrics
            .filter((name) =>
              matched.some((p) => p.components.some((c) => c.name === name)),
            )
            .map((name) => {
              const valid = matched
                .map((p, i) => [
                  componentRate(p, name),
                  componentRate(paired[i]!, name),
                ])
                .filter((pair) => pair.every(Number.isFinite));
              return [
                name,
                spearman(
                  valid.map((p) => p[0]!),
                  valid.map((p) => p[1]!),
                ),
              ];
            }),
        ),
      };
    }),
  );
  const pooled = positions.map((position) => {
    const rows = diagnostics.filter((d) => d.position === position);
    const names = [
      ...new Set(rows.flatMap((r) => r.components.map((c) => c.name))),
    ];
    const absTotal = rows.reduce(
      (sum, r) =>
        sum + r.components.reduce((s, c) => s + c.absoluteContribution, 0),
      0,
    );
    return {
      position,
      meanValueMinutesCorrelation: mean(
        rows.map((r) => r.correlations.valueMinutes!),
      ),
      meanValuePointsCorrelation:
        position === "G"
          ? null
          : mean(rows.map((r) => r.correlations.valuePoints!)),
      meanImpactPointsPer60Correlation:
        position === "G"
          ? null
          : mean(rows.map((r) => r.correlations.impactPointsPer60!)),
      meanAdjacentSeasonImpactCorrelation: mean(
        stability.filter((r) => r.position === position).map((r) => r.impact!),
      ),
      components: names.map((name) => ({
        name,
        absoluteShare:
          rows.reduce(
            (s, r) =>
              s +
              (r.components.find((c) => c.name === name)
                ?.absoluteContribution ?? 0),
            0,
          ) / absTotal,
        meanMedianRankShiftWithout: mean(
          rows.map(
            (r) =>
              r.components.find((c) => c.name === name)!.removal.medianShift!,
          ),
        ),
        meanTop20RetainedWithout: mean(
          rows.map(
            (r) =>
              r.components.find((c) => c.name === name)!.removal.top20Retained,
          ),
        ),
      })),
      meanTop20RetainedScoringOnly:
        position === "G"
          ? null
          : mean(rows.map((r) => r.scoringOnly!.top20Retained)),
      offsets: [0, 0.25, 1].map((offset) => ({
        offset,
        meanMedianRankShift: mean(
          rows.map(
            (r) => r.offsets.find((o) => o.offset === offset)!.medianShift!,
          ),
        ),
        meanTop20Retained: mean(
          rows.map(
            (r) => r.offsets.find((o) => o.offset === offset)!.top20Retained,
          ),
        ),
      })),
    };
  });
  let benchmark: unknown = null;
  if (values.moneypuck) {
    const skaterText = await readFile(
      resolve(values.moneypuck, "moneypuck-2024-skaters.csv"),
      "utf8",
    );
    const goalieText = await readFile(
      resolve(values.moneypuck, "moneypuck-2024-goalies.csv"),
      "utf8",
    );
    sourceHashes.moneypuckSkaters = createHash("sha256")
      .update(skaterText)
      .digest("hex");
    sourceHashes.moneypuckGoalies = createHash("sha256")
      .update(goalieText)
      .digest("hex");
    const skaters = new Map(
      parseCsv(skaterText)
        .filter((p) => p.situation === "5on5")
        .map((p) => [number(p.playerId), p]),
    );
    const goalies = new Map(
      parseCsv(goalieText)
        .filter((p) => p.situation === "all")
        .map((p) => [number(p.playerId), p]),
    );
    const season = seasons.find((s) => s.nhlSeason === 20242025);
    if (!season)
      throw new Error("MoneyPuck diagnostic requires 2024-25 in input");
    const skaterDiagnostics = (["F", "D"] as const).map((position) => {
      const pool = season.ratings.filter(
        (p) =>
          p.position === position &&
          p.status === "rated" &&
          skaters.has(p.playerId),
      );
      const rows = pool.map((p) => skaters.get(p.playerId)!);
      const per60 = (r: Record<string, string>, key: string) =>
        (number(r[key]) * 3600) / number(r.icetime);
      const chanceSuppression = rows.map((r) => -per60(r, "OnIce_A_xGoals"));
      const defense = pool.map((p) => componentRate(p, "defenseEV"));
      const onIceSavePct = rows.map(
        (r) => 1 - number(r.OnIce_A_goals) / number(r.OnIce_A_shotsOnGoal),
      );
      const relativeXg = rows.map(
        (r) =>
          number(r.onIce_xGoalsPercentage) - number(r.offIce_xGoalsPercentage),
      );
      const differential = rows.map(
        (r) => per60(r, "OnIce_F_xGoals") - per60(r, "OnIce_A_xGoals"),
      );
      return {
        position,
        matched: pool.length,
        defenseVsChanceSuppression: spearman(defense, chanceSuppression),
        defenseVsOnIceSavePct: spearman(defense, onIceSavePct),
        territoryVsRelativeXg: spearman(
          pool.map((p) => componentRate(p, "territory5v5")),
          relativeXg,
        ),
        impactVsXgDifferential: spearman(
          pool.map((p) => p.impactPer60!),
          differential,
        ),
        defenseSavePctPearson: correlation(defense, onIceSavePct),
      };
    });
    const goaliePool = season.ratings.filter(
      (p) =>
        p.position === "G" && p.status === "rated" && goalies.has(p.playerId),
    );
    const gsax = goaliePool.map((p) => {
      const r = goalies.get(p.playerId)!;
      return round(number(r.xGoals) - number(r.goals));
    });
    const originalRank = ranks(goaliePool.map((p) => p.seasonValue!)),
      gsaxRank = ranks(gsax);
    const goalieComparison = goaliePool
      .map((p, i) => ({
        name: p.name,
        v1Rank: originalRank[i],
        gsaxRank: gsaxRank[i],
        gsax: gsax[i],
        rankDifference: originalRank[i]! - gsaxRank[i]!,
      }))
      .sort((a, b) => Math.abs(b.rankDifference) - Math.abs(a.rankDifference));
    benchmark = {
      season: 20242025,
      source:
        "MoneyPuck public season summaries; exact files identified by SHA-256; model-dependent diagnostics, not ground truth",
      skaters: skaterDiagnostics,
      goalies: {
        matched: goaliePool.length,
        valueVsGsax: spearman(
          goaliePool.map((p) => p.seasonValue!),
          gsax,
        ),
        ...compareRanks(
          goaliePool.map((p) => p.seasonValue!),
          gsax,
        ),
        largestDifferences: goalieComparison.slice(0, 12),
      },
    };
  }
  const incomplete = seasons.flatMap((s) =>
    s.ratings
      .filter((p) => p.status === "incomplete")
      .map((p) => ({
        season: s.name,
        name: p.name,
        position: p.position,
        minutes: p.minutes,
        missing: p.missing,
      })),
  );
  const output = {
    auditedAt: new Date().toISOString(),
    modelVersion: "nhl-season-value-v1",
    sourceHashes,
    pooled,
    diagnostics,
    stability,
    benchmark,
    incomplete,
    incompleteAboveQualification: incomplete.filter(
      (p) => p.minutes >= (p.position === "G" ? 300 : 200),
    ),
  };
  await mkdir(resolve(values.output), { recursive: true });
  await writeFile(
    resolve(values.output, "audit.json"),
    JSON.stringify(output, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        pooled,
        benchmark,
        incomplete: incomplete.length,
        incompleteAboveQualification: output.incompleteAboveQualification,
      },
      null,
      2,
    ),
  );
}
