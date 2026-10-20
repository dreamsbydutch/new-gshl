import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import type { AbilitySeasonSnapshot } from "../../domains/ranking/nhl-ability-experiment";
import {
  rankNhlReplacementPreview,
  NHL_REPLACEMENT_DEPTH_PRESETS,
  type OverallPreviewInput,
} from "../../runtime/nhl-overall-rating";
import {
  NHL_POOLED_GOALIE_REFERENCE_CONFIG,
  rankNhlPooledGoalieReferencePreview,
} from "../../runtime/nhl-pooled-goalie-reference";

const { values } = parseArgs({
  options: {
    report: { type: "string" },
    overall: { type: "string" },
    history: { type: "string" },
    teams: { type: "string" },
    output: { type: "string" },
    "prior-intervals": { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help) {
  console.log(
    "Offline pooled-goalie-reference research preview. --report <complete v3 report directory> --overall <matching default overall.json> --history <stored-v3-seasons.json> --teams <verified metadata with teamsBySeason> --output <NEW directory> [--prior-intervals <conditional five-prior-season diagnostics.json>]. Expanding earlier-season goalie contrast only; F/D contributions fixed. Fixed G1.5/2/2.5 sensitivities, no leaderboard-based selection. No API/database access or publishable rating output.",
  );
} else {
  if (
    !values.report ||
    !values.overall ||
    !values.history ||
    !values.teams ||
    !values.output
  )
    throw new Error(
      "--report, --overall, --history, --teams and --output required",
    );
  const hash = (text: string) =>
    createHash("sha256").update(text).digest("hex");
  const [reportText, baseText, historyText, teamsText] = await Promise.all([
    readFile(resolve(values.report, "ratings.json"), "utf8"),
    readFile(resolve(values.overall), "utf8"),
    readFile(resolve(values.history), "utf8"),
    readFile(resolve(values.teams), "utf8"),
  ]);
  const report = JSON.parse(reportText) as OverallPreviewInput & {
    season: number;
    version: string;
    config: { revision: string };
    officialTeamCount: number;
    completeSourceScope: boolean;
    qualityGate: unknown;
  };
  const base = JSON.parse(baseText) as ReturnType<
    typeof rankNhlReplacementPreview
  > & { sourceRevision?: string; sourceSha256?: string };
  const history = JSON.parse(historyText) as AbilitySeasonSnapshot;
  const teams = JSON.parse(teamsText) as {
    teamsBySeason: Record<number, number>;
    teamCountEvidence?: string[];
  };
  if (
    report.version !== "nhl-season-value-v3" ||
    !report.completeSourceScope ||
    !report.ratings.length ||
    !report.config.revision.trim()
  )
    throw new Error(
      "Complete v3 source scope, populated ratings and revision required",
    );
  if (
    Object.entries(NHL_REPLACEMENT_DEPTH_PRESETS.default).some(
      ([key, depth]) => base.depth[key as keyof typeof base.depth] !== depth,
    ) ||
    base.numberOfTeams !== report.officialTeamCount ||
    teams.teamsBySeason[report.season] !== report.officialTeamCount ||
    (base.sourceRevision !== undefined &&
      base.sourceRevision !== report.config.revision) ||
    (base.sourceSha256 !== undefined && base.sourceSha256 !== hash(reportText))
  )
    throw new Error(
      "Default overall preview or verified team counts differ from current source",
    );
  let diagnostic: unknown = null;
  let diagnosticHash: string | null = null;
  if (values["prior-intervals"]) {
    const text = await readFile(resolve(values["prior-intervals"]), "utf8");
    diagnosticHash = hash(text);
    const source = JSON.parse(text) as {
      interpretation?: string;
      comparisons: Array<{
        targetSeason: number;
        position: string;
        component: string;
      }>;
    };
    diagnostic = {
      interpretation:
        "Separate conditional five-season diagnostic, not an interval for expanding history or total uncertainty. Only the matching target season is included.",
      originalInterpretation: source.interpretation,
      comparisons: source.comparisons.filter(
        (p) =>
          p.targetSeason === report.season &&
          p.position === "G" &&
          p.component === "saving",
      ),
    };
  }
  const experiments = Object.entries(
    NHL_POOLED_GOALIE_REFERENCE_CONFIG.goalieDepths,
  ).map(([label, G]) => {
    const baseline =
      G === 2
        ? base
        : rankNhlReplacementPreview({
            ...report,
            numberOfTeams: report.officialTeamCount,
            depth: { ...base.depth, G },
          });
    const candidate = rankNhlPooledGoalieReferencePreview({
      currentSeason: report.season,
      currentRevision: report.config.revision,
      current: report,
      baseOverall: baseline,
      historical: history,
      teamsBySeason: teams.teamsBySeason,
    });
    const counts = (rows: typeof baseline.ratings) =>
      Object.fromEntries(
        ["F", "D", "G"].map((position) => [
          position,
          rows.filter(
            (p) =>
              p.overallRank !== null &&
              p.overallRank <= 20 &&
              p.position === position,
          ).length,
        ]),
      );
    const matched = candidate.overall.ratings
      .filter((p) => p.overallValue !== null)
      .map((p) => ({
        current: p,
        baseline: baseline.ratings.find((q) => q.playerId === p.playerId)!,
      }));
    return {
      label,
      baselineDepth: baseline.depth,
      candidate,
      comparisonSummary: {
        ranked: candidate.overall.ratings.filter((p) => p.overallRank !== null)
          .length,
        baselineTop20Positions: counts(baseline.ratings),
        candidateTop20Positions: counts(candidate.overall.ratings),
        maximumValueChange: matched.length
          ? Math.max(
              ...matched.map((p) =>
                Math.abs(p.current.overallValue! - p.baseline.overallValue!),
              ),
            )
          : null,
        maximumRankChange: matched.length
          ? Math.max(
              ...matched.map((p) =>
                Math.abs(p.current.overallRank! - p.baseline.overallRank!),
              ),
            )
          : null,
        baselineTop20: baseline.ratings.filter(
          (p) => p.overallRank !== null && p.overallRank <= 20,
        ),
        candidateTop20: candidate.overall.ratings.filter(
          (p) => p.overallRank !== null && p.overallRank <= 20,
        ),
      },
    };
  });
  const output = resolve(values.output);
  await mkdir(output);
  const artifact = {
    researchOnly: true,
    version: NHL_POOLED_GOALIE_REFERENCE_CONFIG.version,
    season: report.season,
    sourceQualityGate: report.qualityGate,
    sourceHashes: {
      currentReport: hash(reportText),
      currentOverall: hash(baseText),
      historicalSnapshot: hash(historyText),
      verifiedTeamMetadata: hash(teamsText),
      priorFiveYearDiagnostic: diagnosticHash,
    },
    codeHashes: {
      pooledReference: hash(
        await readFile(
          resolve("scripts/src/runtime/nhl-pooled-goalie-reference.ts"),
          "utf8",
        ),
      ),
      historicalStability: hash(
        await readFile(
          resolve("scripts/src/domains/ranking/nhl-reference-stability.ts"),
          "utf8",
        ),
      ),
      command: hash(
        await readFile(
          resolve("scripts/src/commands/ratings/preview-nhl-pooled-goalie.ts"),
          "utf8",
        ),
      ),
    },
    teamCountEvidence: teams.teamCountEvidence ?? [],
    interpretation:
      "All F/D reference depths, values and components stay fixed at the supplied current baseline across all G-depth policies. Only goalie saving reference changes; global skater ranks can change when goalies move. No winning depth policy is selected.",
    priorFiveYearDiagnostic: diagnostic,
    experiments,
  };
  await writeFile(
    resolve(output, "analysis.json"),
    JSON.stringify(artifact, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(
    JSON.stringify(
      experiments.map((e) => ({
        label: e.label,
        reference: e.candidate.reference,
        comparison: e.candidate.comparison,
        ...e.comparisonSummary,
        baselineTop20: undefined,
        candidateTop20: undefined,
      })),
      null,
      2,
    ),
  );
}
