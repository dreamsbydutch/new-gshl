import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadAuditedRetrospectiveShots } from "../../integrations/nhl/retrospective-shot-source";
import { rankNhlReplacementPreview } from "../../runtime/nhl-overall-rating";
import type { GameSeasonRating } from "../../runtime/nhl-game-season-value";
import type { ImpactModel } from "../../runtime/nhl-adjusted-impact";
import type { NhlRatingSource } from "../../domains/nhl/season-rating-input";
import { retrospectiveAuditsMatch } from "../../domains/nhl/retrospective-audit-compatibility";

type Reuse = {
  valuesDirectory: string;
  ratingsSha256: string;
  overallSha256: string;
  sourceAuditSha256: string;
  sourcePath: string;
  oofDirectory: string;
  shotRowsPath: string;
};
type Season = {
  seasonId: string;
  name: string;
  nhlSeason: number;
  state: "completed" | "current" | "future";
  asOf: string;
  historicalShotBridge?: boolean;
  repairPenaltyShotContext?: boolean;
  reuse?: Reuse;
};
type Inventory = {
  version: "nhl-hockey-overall-inventory-v1";
  seasons: Season[];
};
type Ready = Reuse & {
  sourceSha256: string;
  sourceFetchedAt: string;
  numberOfTeams: number;
};
type Outcome = Season &
  Partial<Ready> & {
    status: "ready" | "failed" | "pending";
    sourceSnapshotKind: "completed-season" | "season-to-date" | "future";
    error?: string;
    requestedAsOf?: string;
  };
type ValueReport = {
  version: string;
  publishable: boolean;
  season: number;
  gameType: number;
  sourceGates: Record<string, boolean>;
  provenance: {
    canonicalSourceSha256: string;
    rowsSha256: string;
    allRowInferenceAudit: Record<string, unknown>;
  };
  qualificationInvariant: { passed: boolean; players: number };
  residualCreditAudit: Record<
    "gb" | "glm",
    {
      passed: boolean;
      maximumPlayerError: number;
      perPlayerRoundingTolerance: number;
      unrepresentedEventPlayers: unknown[];
    }
  >;
  gb: { model: ImpactModel; ratings: GameSeasonRating[] };
  glm: { model: ImpactModel; ratings: GameSeasonRating[] };
};
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function insist(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
async function json<T>(path: string) {
  const text = await readFile(resolve(path), "utf8");
  return { value: JSON.parse(text) as T, text, sha256: hash(text) };
}
const { values } = parseArgs({
  options: {
    inventory: { type: "string" },
    output: { type: "string" },
    season: { type: "string" },
    cache: { type: "string" },
    python: { type: "string", default: "python" },
    "plan-only": { type: "boolean" },
    help: { type: "boolean" },
  },
});
if (values.help) {
  console.log(
    "Resumable LOCAL reviewed NHL overall build. --inventory <explicit DB-season inventory.json> --output <resumable root> [--season <comma-separated NHL years>] [--cache <retained cache root>] [--python <Python executable>] [--plan-only]. Fixed nested GB OOF plus annual replacement; GLM remains an audit arm. Source collection is public and throttled. Fresh attempts/logs preserve failures; exact hash-bound artifacts can resume. Current seasons are explicitly season-to-date; future seasons remain pending without requests. No chronological fits, publication, deployment or database writes.",
  );
} else {
  insist(
    values.inventory && values.output,
    "--inventory and --output required",
  );
  await main(values.inventory, values.output);
}

async function validateReady(season: Season, binding: Reuse): Promise<Ready> {
  const [report, overall, audit, source] = await Promise.all([
    json<ValueReport>(resolve(binding.valuesDirectory, "ratings.json")),
    json<{
      version: string;
      publishable: boolean;
      season: number;
      gb: ReturnType<typeof rankNhlReplacementPreview>;
      glm: ReturnType<typeof rankNhlReplacementPreview>;
    }>(resolve(binding.valuesDirectory, "overall.json")),
    json<{
      version: string;
      publishable: boolean;
      provenance: unknown;
      sourceGates: unknown;
    }>(resolve(binding.valuesDirectory, "source-audit.json")),
    json<{ nhl: NhlRatingSource }>(binding.sourcePath),
  ]);
  insist(
    report.sha256 === binding.ratingsSha256 &&
      overall.sha256 === binding.overallSha256 &&
      audit.sha256 === binding.sourceAuditSha256,
    "Declared reuse/result hashes differ",
  );
  const data = report.value;
  insist(
    data.version === "nhl-retrospective-season-values-research-v1" &&
      data.publishable === false &&
      data.season === season.nhlSeason &&
      data.gameType === 2 &&
      overall.value.version === "nhl-retrospective-overall-research-v1" &&
      overall.value.publishable === false &&
      overall.value.season === data.season &&
      audit.value.version === "nhl-retrospective-value-source-audit-v1" &&
      audit.value.publishable === false,
    "Completed regular-season retrospective artifact versions/scope required",
  );
  insist(
    source.value.nhl.season === data.season &&
      source.value.nhl.gameType === 2 &&
      Number.isFinite(Date.parse(source.value.nhl.fetchedAt)) &&
      data.provenance.canonicalSourceSha256 === source.sha256,
    "Canonical official source or timestamp differs",
  );
  insist(
    JSON.stringify(audit.value.provenance) ===
      JSON.stringify(data.provenance) &&
      JSON.stringify(audit.value.sourceGates) ===
        JSON.stringify(data.sourceGates) &&
      [
        "officialSeasonExposureMatches",
        "completeDownload",
        "atLeast98PercentProcessExposureVerified",
        "atLeast98PercentIndividualShotsVerified",
      ].every((key) => data.sourceGates[key] === true),
    "Physical source gates/provenance fail or differ",
  );
  const oof = await loadAuditedRetrospectiveShots(
    resolve(binding.oofDirectory),
    resolve(binding.shotRowsPath),
  );
  insist(
    oof.source.season === data.season &&
      oof.source.gameType === 2 &&
      oof.source.rowsSha256 === data.provenance.rowsSha256 &&
      retrospectiveAuditsMatch(data.provenance.allRowInferenceAudit, oof.audit),
    "Native all-row OOF audit does not reproduce exact valuation input",
  );
  insist(
    data.qualificationInvariant.passed === true &&
      data.qualificationInvariant.players === data.gb.ratings.length,
    "Qualification invariant fails",
  );
  for (const arm of ["gb", "glm"] as const) {
    const raw = data[arm],
      residual = data.residualCreditAudit[arm];
    insist(
      raw.model.converged &&
        raw.model.lambda === 4 &&
        residual.passed &&
        Number.isFinite(residual.maximumPlayerError) &&
        residual.maximumPlayerError >= 0 &&
        residual.maximumPlayerError <= residual.perPlayerRoundingTolerance &&
        residual.perPlayerRoundingTolerance <= 0.000050001 &&
        residual.unrepresentedEventPlayers.length === 0,
      "Fixed fit or player residual reconciliation failed",
    );
    const annual = rankNhlReplacementPreview({
      ...raw,
      numberOfTeams: overall.value[arm].numberOfTeams,
    });
    insist(
      JSON.stringify(annual) === JSON.stringify(overall.value[arm]),
      "Annual replacement values do not exactly reproduce",
    );
  }
  return {
    ...binding,
    valuesDirectory: resolve(binding.valuesDirectory),
    sourcePath: resolve(binding.sourcePath),
    oofDirectory: resolve(binding.oofDirectory),
    shotRowsPath: resolve(binding.shotRowsPath),
    sourceSha256: source.sha256,
    sourceFetchedAt: source.value.nhl.fetchedAt,
    numberOfTeams: overall.value.gb.numberOfTeams,
  };
}

async function main(inventoryPath: string, outputPath: string) {
  const inventory = await json<Inventory>(inventoryPath);
  insist(
    inventory.value.version === "nhl-hockey-overall-inventory-v1" &&
      Array.isArray(inventory.value.seasons) &&
      inventory.value.seasons.length > 0,
    "Explicit nonempty inventory required",
  );
  const all = inventory.value.seasons;
  insist(
    all.every(
      (season) =>
        season.historicalShotBridge === undefined ||
        (typeof season.historicalShotBridge === "boolean" &&
          season.nhlSeason >= 20082009 &&
          season.nhlSeason <= 20122013),
    ),
    "Historical raw-shot recovery requires an explicit supported historical season",
  );
  insist(
    all.every(
      (season) =>
        season.repairPenaltyShotContext === undefined ||
        (typeof season.repairPenaltyShotContext === "boolean" &&
          season.nhlSeason >= 20082009 &&
          season.nhlSeason <= 20122013),
    ),
    "Penalty-shot context recovery requires an explicit supported historical season",
  );
  insist(
    new Set(all.map((s) => s.seasonId)).size === all.length &&
      new Set(all.map((s) => s.nhlSeason)).size === all.length &&
      all.every(
        (s) =>
          typeof s.seasonId === "string" &&
          s.seasonId.length > 0 &&
          typeof s.name === "string" &&
          Number.isInteger(s.nhlSeason) &&
          Math.floor(s.nhlSeason / 10000) + 1 === s.nhlSeason % 10000 &&
          ["completed", "current", "future"].includes(s.state) &&
          Number.isFinite(Date.parse(s.asOf)),
      ),
    "Invalid/duplicate inventory identity, season, state or as-of",
  );
  const selected = values.season?.split(",").map(Number);
  insist(
    !selected ||
      (selected.length > 0 &&
        new Set(selected).size === selected.length &&
        selected.every((s) => all.some((r) => r.nhlSeason === s))),
    "Selected seasons missing or duplicated",
  );
  const seasons = all.filter(
    (s) => !selected || selected.includes(s.nhlSeason),
  );
  const output = resolve(outputPath);
  await mkdir(output, { recursive: true });
  const policyPath = "docs/product/nhl-hockey-overall-production-policy.md";
  const policyText = await readFile(policyPath, "utf8");
  insist(
    policyText.includes("Status: **SEALED"),
    "Fixed policy must be sealed",
  );
  const codePaths = [
    "scripts/src/commands/ratings/rebuild-nhl-hockey-overall.ts",
    "scripts/src/commands/ratings/collect-nhl-value-games.ts",
    "scripts/src/commands/ratings/prepare-nhl-retrospective-source.ts",
    "scripts/src/commands/ratings/preview-nhl-retrospective-values.ts",
    "scripts/src/integrations/nhl/retrospective-value-context.ts",
    "scripts/src/integrations/nhl/retrospective-shot-source.ts",
    "scripts/src/integrations/nhl/game-value-source.ts",
    "scripts/src/domains/nhl/game-value-input.ts",
    "scripts/src/domains/nhl/verified-game-source.ts",
    "scripts/src/domains/nhl/official-shift-report.ts",
    "scripts/src/domains/nhl/unavailable-shift-proof.ts",
    "scripts/src/integrations/nhl/unavailable-shift-source.ts",
    "scripts/src/domains/nhl/official-game-clock.ts",
    "scripts/src/domains/nhl/boundary-shift-reconciliation.ts",
    "scripts/src/domains/nhl/boundary-shift-2008-cases.ts",
    "scripts/src/integrations/nhl/boundary-shift-source.ts",
    "scripts/src/domains/nhl/official-goal-coverage.ts",
    "scripts/src/domains/nhl/official-on-goal-coverage.ts",
    "scripts/src/domains/nhl/official-on-goal-classification.ts",
    "scripts/src/integrations/nhl/official-on-goal-classification-source.ts",
    "scripts/src/domains/nhl/official-shot-credit-reconciliation.ts",
    "scripts/src/integrations/nhl/official-shot-credit-source.ts",
    "scripts/src/domains/nhl/official-primary-event-recovery.ts",
    "scripts/src/integrations/nhl/official-primary-event-source.ts",
    "scripts/src/domains/nhl/reviewed-event-source-availability.ts",
    "scripts/src/integrations/nhl/reviewed-event-source-availability-source.ts",
    "scripts/src/domains/nhl/reviewed-2008-shot-credit.ts",
    "scripts/src/integrations/nhl/reviewed-2008-shot-credit-source.ts",
    "scripts/src/integrations/nhl/official-goal-physical-audit.ts",
    "scripts/src/domains/nhl/official-penalty-shot-report.ts",
    "scripts/src/domains/nhl/official-penalty-shot-context.ts",
    "scripts/src/domains/nhl/official-missing-penalty-shot.ts",
    "scripts/src/integrations/nhl/official-penalty-shot-context-source.ts",
    "scripts/src/domains/nhl/official-empty-net-report.ts",
    "scripts/src/domains/nhl/historical-shot-source-bridge.ts",
    "scripts/src/domains/nhl/historical-shot-type-alignment.ts",
    "scripts/src/domains/nhl/reviewed-paired-penalty-shot-source.ts",
    "scripts/src/domains/nhl/reviewed-gs-penalty-source.ts",
    "scripts/src/domains/nhl/reviewed-report-only-penalty-shot-award.ts",
    "scripts/src/domains/nhl/historical-penalty-alignment.ts",
    "scripts/src/domains/nhl/missing-native-shot-source.ts",
    "scripts/src/integrations/nhl/historical-shot-source.ts",
    "scripts/src/domains/nhl/game-reconciliation.ts",
    "scripts/src/domains/nhl/game-value-audit.ts",
    "scripts/src/runtime/nhl-shot-quality.ts",
    "scripts/src/runtime/nhl-adjusted-impact.ts",
    "scripts/src/runtime/nhl-overall-rating.ts",
    "scripts/src/runtime/nhl-game-season-value.ts",
    "scripts/src/domains/nhl/retrospective-audit-compatibility.ts",
    "scripts/python/nhl_rating/retrospective-crossfit.py",
    "scripts/python/nhl_rating/nonlinear-shot-experiment.py",
    "docs/product/nhl-historical-source-recovery.md",
  ];
  const codeHashes = await Promise.all(
    codePaths.map(async (path) => ({
      path,
      sha256: hash(await readFile(path, "utf8")),
    })),
  );
  const verifyCode = async () => {
    insist(
      hash(await readFile(policyPath, "utf8")) === hash(policyText),
      "Policy changed during build",
    );
    for (const item of codeHashes)
      insist(
        hash(await readFile(item.path, "utf8")) === item.sha256,
        `Build code changed: ${item.path}`,
      );
  };
  const runId = `${Date.now()}-${process.pid}`;
  const runRoot = resolve(output, "runs", runId);
  await mkdir(runRoot, { recursive: true });
  const outcomes: Outcome[] = [];
  const saveSummary = async () => {
    const summary = {
      version: "nhl-hockey-overall-build-v1",
      localOnly: true,
      policy: { path: resolve(policyPath), sha256: hash(policyText) },
      inventory: { path: resolve(inventoryPath), sha256: inventory.sha256 },
      codeHashes,
      runId,
      seasons: outcomes,
      pending: seasons.filter(
        (s) => !outcomes.some((o) => o.nhlSeason === s.nhlSeason),
      ),
      updatedAt: new Date().toISOString(),
    };
    await writeFile(
      resolve(output, "summary.json"),
      JSON.stringify(summary, null, 2) + "\n",
    );
    await writeFile(
      resolve(runRoot, `summary-${outcomes.length}.json`),
      JSON.stringify(summary, null, 2) + "\n",
      { flag: "wx" },
    );
  };
  if (values["plan-only"]) {
    await writeFile(
      resolve(runRoot, "plan.json"),
      JSON.stringify(
        {
          inventory,
          policy: { path: policyPath, sha256: hash(policyText) },
          seasons,
          codeHashes,
          remoteWrites: false,
          executeFits: false,
        },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    );
    console.log(
      JSON.stringify({
        plan: runRoot,
        seasons: seasons.length,
        fitsRun: false,
      }),
    );
    return;
  }
  const lock = resolve(output, "active.lock");
  await writeFile(lock, runId, { flag: "wx" });
  async function command(
    executable: string,
    args: string[],
    log: string,
    allowFailure = false,
  ) {
    await verifyCode();
    let transcript = "";
    const exitCode = await new Promise<number | null>((accept, reject) => {
      const child = spawn(executable, args, {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.on("data", (data: Buffer) => {
        transcript += data;
        process.stdout.write(data);
      });
      child.stderr.on("data", (data: Buffer) => {
        transcript += data;
        process.stderr.write(data);
      });
      child.on("error", reject);
      child.on("close", accept);
    });
    await writeFile(log, transcript, { flag: "wx" });
    await verifyCode();
    insist(
      exitCode === 0 || allowFailure,
      `Command failed (${exitCode}); see ${log}`,
    );
    return exitCode;
  }
  const nodeCommand = (
    name: string,
    args: string[],
    log: string,
    allowFailure = false,
  ) =>
    command(
      process.execPath,
      [
        "--use-system-ca",
        "--import",
        "tsx",
        resolve("scripts/src/commands/ratings", name),
        ...args,
      ],
      log,
      allowFailure,
    );
  try {
    for (const season of seasons) {
      const sourceSnapshotKind =
        season.state === "future"
          ? "future"
          : season.state === "current"
            ? "season-to-date"
            : "completed-season";
      try {
        if (season.state === "future") {
          outcomes.push({
            ...season,
            sourceSnapshotKind,
            status: "pending",
            error:
              "Future season: no completed-game source requests or synthetic ratings",
          });
          await saveSummary();
          continue;
        }
        const checkpoint = resolve(output, `${season.nhlSeason}-ready.json`);
        let reuse = season.reuse;
        if (!reuse) {
          try {
            const previous = await json<{
              season: Season;
              artifacts: Ready;
              policySha256: string;
            }>(checkpoint);
            insist(
              JSON.stringify(previous.value.season) ===
                JSON.stringify(season) &&
                previous.value.policySha256 === hash(policyText),
              "Resume inventory/policy changed",
            );
            reuse = previous.value.artifacts;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
        }
        let ready: Ready;
        if (reuse) ready = await validateReady(season, reuse);
        else {
          const directory = resolve(runRoot, String(season.nhlSeason));
          await mkdir(directory);
          const aggregate = resolve(directory, "official");
          await nodeCommand(
            "preview-nhl-season.ts",
            ["--season", String(season.nhlSeason), "--output", aggregate],
            resolve(directory, "official.log"),
          );
          const nhl = await json<NhlRatingSource>(
            resolve(aggregate, "source.json"),
          );
          const baseline = resolve(directory, "baseline"),
            canonical = resolve(baseline, String(season.nhlSeason));
          await mkdir(canonical, { recursive: true });
          await writeFile(
            resolve(canonical, "source.json"),
            JSON.stringify({ nhl: nhl.value }, null, 2) + "\n",
            { flag: "wx" },
          );
          await writeFile(
            resolve(canonical, "ratings.json"),
            JSON.stringify(
              {
                version: "nhl-ability-default-priors-v1",
                season: season.nhlSeason,
                calibration: {},
                policySha256: hash(policyText),
                interpretation:
                  "Explicit unchanged runtime default ability priors; no MoneyPuck model or fabricated v2 calibration",
              },
              null,
              2,
            ) + "\n",
            { flag: "wx" },
          );
          const cache =
            season.state === "current"
              ? resolve(
                  values.cache ?? resolve(output, "cache"),
                  String(season.nhlSeason),
                  hash(season.asOf).slice(0, 12),
                )
              : resolve(
                  values.cache ?? resolve(output, "cache"),
                  String(season.nhlSeason),
                );
          const common = [
            "--season",
            String(season.nhlSeason),
            "--cache",
            cache,
          ];
          const recovery = [
            ...(season.historicalShotBridge
              ? ["--historical-shot-bridge"]
              : []),
            ...(season.repairPenaltyShotContext
              ? ["--repair-penalty-shot-context"]
              : []),
          ];
          await nodeCommand(
            "collect-nhl-value-games.ts",
            [
              ...common,
              ...recovery,
              "--output",
              resolve(directory, "collection.json"),
            ],
            resolve(directory, "collection.log"),
          );
          const first = resolve(directory, "source-initial");
          await nodeCommand(
            "prepare-nhl-retrospective-source.ts",
            [...common, "--baseline", baseline, "--output", first],
            resolve(directory, "source-initial.log"),
            true,
          );
          const manifest = await json<{ passesSourceGates: boolean }>(
            resolve(first, "source-manifest.json"),
          );
          let prepared = first;
          if (!manifest.value.passesSourceGates) {
            await nodeCommand(
              "collect-nhl-value-games.ts",
              [
                ...common,
                ...recovery,
                "--repair-audit",
                resolve(first, "game-audit.json"),
                "--output",
                resolve(directory, "repair.json"),
              ],
              resolve(directory, "repair.log"),
              true,
            );
            prepared = resolve(directory, "source-reviewed");
            await nodeCommand(
              "prepare-nhl-retrospective-source.ts",
              [...common, "--baseline", baseline, "--output", prepared],
              resolve(directory, "source-reviewed.log"),
            );
          }
          const rows = resolve(prepared, "shot-rows.json"),
            oof = resolve(directory, "crossfit");
          await command(
            values.python!,
            [
              "scripts/python/nhl_rating/retrospective-crossfit.py",
              "--source-only",
              "--rows",
              rows,
              "--source-metadata",
              resolve(prepared, "source-manifest.json"),
              "--policy",
              policyPath,
              "--output",
              oof,
            ],
            resolve(directory, "crossfit.log"),
          );
          await nodeCommand(
            "verify-nhl-retrospective-shots.ts",
            [
              "--directory",
              oof,
              "--rows",
              rows,
              "--output",
              resolve(directory, "all-row-audit.json"),
            ],
            resolve(directory, "all-row-audit.log"),
          );
          const fitted = resolve(directory, "values");
          await nodeCommand(
            "preview-nhl-retrospective-values.ts",
            [
              "--source-manifest",
              resolve(prepared, "source-manifest.json"),
              "--policy",
              policyPath,
              "--baseline",
              baseline,
              "--cache",
              cache,
              "--oof",
              oof,
              "--rows",
              rows,
              "--output",
              fitted,
            ],
            resolve(directory, "values.log"),
          );
          const hashes = await Promise.all(
            ["ratings.json", "overall.json", "source-audit.json"].map(
              async (file) =>
                hash(await readFile(resolve(fitted, file), "utf8")),
            ),
          );
          ready = await validateReady(season, {
            valuesDirectory: fitted,
            ratingsSha256: hashes[0]!,
            overallSha256: hashes[1]!,
            sourceAuditSha256: hashes[2]!,
            sourcePath: resolve(canonical, "source.json"),
            oofDirectory: oof,
            shotRowsPath: rows,
          });
        }
        await verifyCode();
        // The mutable checkpoint only locates immutable hash-bound artifacts.
        await writeFile(
          checkpoint,
          JSON.stringify(
            { season, policySha256: hash(policyText), artifacts: ready },
            null,
            2,
          ) + "\n",
        );
        outcomes.push({
          ...season,
          ...ready,
          ...(season.state === "current"
            ? { requestedAsOf: season.asOf, asOf: ready.sourceFetchedAt }
            : {}),
          sourceSnapshotKind,
          status: "ready",
        });
      } catch (error) {
        outcomes.push({
          ...season,
          sourceSnapshotKind,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
      await saveSummary();
    }
  } finally {
    await unlink(lock);
  }
  if (outcomes.some((s) => s.status === "failed")) process.exitCode = 1;
  console.log(
    JSON.stringify({
      output,
      ready: outcomes.filter((s) => s.status === "ready").length,
      failed: outcomes.filter((s) => s.status === "failed").length,
      futurePending: outcomes.filter((s) => s.status === "pending").length,
    }),
  );
}
