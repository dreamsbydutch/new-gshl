import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { stableJson } from "../../domains/nhl/hockey-overall-deployment";
import {
  rolloutDeployment,
  rolloutModel,
  validateRolloutCheckpoint,
  validateRolloutCounts,
  validateRolloutInventory,
  validateRolloutPublicationScope,
  validateRolloutPlanIdentity,
  type ReadyCheckpoint,
  type RolloutCounts,
  type RolloutInventory,
  type RolloutSeason,
} from "../../domains/nhl/hockey-overall-rollout";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const hash = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const sleep = (milliseconds: number) =>
  new Promise((accept) => setTimeout(accept, milliseconds));
const { values } = parseArgs({
  options: {
    inventory: { type: "string" },
    checkpoints: { type: "string" },
    output: { type: "string" },
    target: { type: "string" },
    deployment: { type: "string" },
    apply: { type: "boolean", default: false },
    "wait-for-ready": { type: "string", default: "0" },
    "poll-seconds": { type: "string", default: "30" },
    "local-only": { type: "boolean", default: false },
    "plan-only": { type: "boolean", default: false },
    help: { type: "boolean" },
  },
});
if (values.help) {
  console.log(
    "Finite resumable NHL reviewed-overall rollout. --target production --deployment polished-tern-709 --inventory ORIGINAL_JSON --checkpoints BUILD_ROOT --output RESUMABLE_ROOT [--apply] [--wait-for-ready SECONDS (0..86400)] [--poll-seconds SECONDS (1..60)] [--local-only | --plan-only]. Defaults to production dry-run. Exact original16-season scope:14 nonfuture targets and2 disclosed future pending. Uses only existing ready checkpoints through frozen single-season builder reuse and publisher verification; no fits, source downloads, deployment, deletion or replacement. Apply requires zero updates, then100%unchanged verification. Local-only verifies without production requests; plan-only inspects stable checkpoint identities without child commands. Missing/failed nonfuture seasons remain explicit and exit nonzero; each ready season proceeds independently.",
  );
} else {
  if (
    !values.inventory ||
    !values.checkpoints ||
    !values.output ||
    values.target !== "production" ||
    values.deployment !== rolloutDeployment ||
    (values.apply && (values["local-only"] || values["plan-only"]))
  )
    throw Error(
      "Explicit production target/inventory/checkpoints/output required; local modes cannot apply",
    );
  const waitSeconds = Number(values["wait-for-ready"]),
    pollSeconds = Number(values["poll-seconds"]);
  if (
    !Number.isInteger(waitSeconds) ||
    waitSeconds < 0 ||
    waitSeconds > 86400 ||
    !Number.isInteger(pollSeconds) ||
    pollSeconds < 1 ||
    pollSeconds > 60
  )
    throw Error("Finite wait/poll duration required");
  await main(
    resolve(values.inventory),
    resolve(values.checkpoints),
    resolve(values.output),
    waitSeconds,
    pollSeconds,
  );
}

type Outcome = {
  nhlSeason: number;
  seasonId: string;
  state: RolloutSeason["state"];
  status:
    | "pending"
    | "future-pending"
    | "failed"
    | "checkpoint-ready"
    | "local-verified"
    | "dry-run-ready"
    | "published"
    | "unchanged";
  checkpointSha256?: string;
  attempt?: string;
  stage?: string;
  exitCode?: number | null;
  rows?: number;
  counts?: RolloutCounts;
  reason?: string;
};
async function main(
  inventoryPath: string,
  checkpoints: string,
  output: string,
  waitSeconds: number,
  pollSeconds: number,
) {
  const inventoryBytes = await readFile(inventoryPath);
  const inventory = JSON.parse(inventoryBytes.toString()) as RolloutInventory;
  const seasons = validateRolloutInventory(inventory);
  const policyPath = resolve(
    root,
    "docs/product/nhl-hockey-overall-production-policy.md",
  );
  const policy = await readFile(policyPath, "utf8");
  if (!policy.includes("Status: **SEALED"))
    throw Error("Production policy must be sealed");
  const policySha256 = hash(policy),
    inventorySha256 = hash(inventoryBytes);
  const codePaths = [
    "scripts/src/commands/ratings/rollout-nhl-hockey-overall.ts",
    "scripts/src/domains/nhl/hockey-overall-rollout.ts",
    "scripts/src/domains/nhl/hockey-overall-deployment.ts",
    "scripts/src/commands/ratings/rebuild-nhl-hockey-overall.ts",
    "scripts/src/commands/ratings/publish-nhl-hockey-overall.ts",
    "scripts/src/integrations/nhl/hockey-overall-publication.ts",
    "scripts/src/domains/nhl/hockey-overall-publication.ts",
  ];
  const codeHashes = await Promise.all(
    codePaths.map(async (path) => ({
      path,
      sha256: hash(await readFile(resolve(root, path))),
    })),
  );
  const binding = {
    version: "nhl-hockey-overall-rollout-v1",
    target: "production",
    deployment: rolloutDeployment,
    modelVersion: rolloutModel,
    inventory: { path: inventoryPath, sha256: inventorySha256 },
    policy: { path: policyPath, sha256: policySha256 },
    checkpoints,
    codeHashes,
  };
  await mkdir(output, { recursive: true });
  try {
    await writeFile(
      resolve(output, "rollout-binding.json"),
      JSON.stringify(binding, null, 2) + "\n",
      { flag: "wx" },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (
      stableJson(
        JSON.parse(
          await readFile(resolve(output, "rollout-binding.json"), "utf8"),
        ),
      ) !== stableJson(binding)
    )
      throw Error(
        "Resume inventory/policy/checkpoint root or operator code changed",
      );
  }
  const runId = `${Date.now()}-${process.pid}`,
    runRoot = resolve(output, "runs", runId);
  await mkdir(runRoot, { recursive: true });
  await writeFile(
    resolve(runRoot, "run.json"),
    JSON.stringify(
      {
        binding,
        apply: values.apply,
        localOnly: values["local-only"],
        planOnly: values["plan-only"],
        waitSeconds,
        pollSeconds,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  const outcomes = new Map<number, Outcome>(
    seasons.map((season) => [
      season.nhlSeason,
      {
        nhlSeason: season.nhlSeason,
        seasonId: season.seasonId,
        state: season.state,
        status: season.state === "future" ? "future-pending" : "pending",
        reason:
          season.state === "future"
            ? "Future season: no source requests or synthetic ratings"
            : "Ready checkpoint not yet available",
      },
    ]),
  );
  const attempted = new Map<number, string>();
  let event = 0;
  const verifyBinding = async () => {
    if (
      hash(await readFile(inventoryPath)) !== inventorySha256 ||
      hash(await readFile(policyPath)) !== policySha256
    )
      throw Error("Pinned inventory or policy changed");
    for (const file of codeHashes)
      if (hash(await readFile(resolve(root, file.path))) !== file.sha256)
        throw Error("Rollout or frozen publication code changed");
  };
  const save = async () => {
    const entries = [...outcomes.values()];
    const unfinished = entries.filter(
      (entry) =>
        entry.state !== "future" &&
        ["pending", "failed", "checkpoint-ready"].includes(entry.status),
    );
    const summary = {
      ...binding,
      runId,
      apply: values.apply,
      localOnly: values["local-only"],
      planOnly: values["plan-only"],
      updatedAt: new Date().toISOString(),
      seasons: entries,
      futurePendingSeasons: 2,
      unfinishedNonfutureSeasons: unfinished.length,
    };
    const text = JSON.stringify(summary, null, 2) + "\n";
    await writeFile(
      resolve(runRoot, `journal-${String(event++).padStart(4, "0")}.json`),
      text,
      { flag: "wx" },
    );
    await writeFile(resolve(output, "summary.json"), text);
    return unfinished.length;
  };
  const child = async (name: string, args: string[]) => {
    await verifyBinding();
    const exit = await new Promise<number | null>((accept, reject) => {
      const processChild = spawn(
        process.execPath,
        [
          "--use-system-ca",
          "--import",
          "tsx",
          resolve(root, "scripts/src/commands/ratings", name),
          ...args,
        ],
        { cwd: root, windowsHide: true, stdio: "ignore" },
      );
      processChild.on("error", () =>
        reject(Error("Verified child could not start")),
      );
      processChild.on("close", accept);
    });
    await verifyBinding();
    return exit;
  };
  const publisher = async (
    buildSummary: string,
    directory: string,
    season: RolloutSeason,
    summarySha256: string,
    apply = false,
  ) => {
    if (hash(await readFile(buildSummary)) !== summarySha256)
      throw Error("Verified build summary changed before publication");
    const exit = await child("publish-nhl-hockey-overall.ts", [
      "--target",
      "production",
      "--deployment",
      rolloutDeployment,
      "--input",
      buildSummary,
      "--season",
      String(season.nhlSeason),
      "--output",
      directory,
      ...(apply ? ["--apply"] : []),
      ...(values["local-only"] ? ["--local-only"] : []),
    ]);
    if (hash(await readFile(buildSummary)) !== summarySha256)
      throw Error("Verified build summary changed during publication");
    return exit;
  };
  const publicationCounts = async (
    directory: string,
    season: RolloutSeason,
    rows: number,
    apply: boolean,
  ) => {
    const report = JSON.parse(
      await readFile(resolve(directory, "summary.json"), "utf8"),
    );
    if (
      report.deployment !== rolloutDeployment ||
      report.modelVersion !== rolloutModel ||
      report.apply !== apply ||
      report.localOnly !== false ||
      report.readySeasons !== 1 ||
      report.outcomes.length !== 1 ||
      report.unfinishedNonfutureSeasons !== 0 ||
      report.outcomes[0].nhlSeason !== season.nhlSeason ||
      report.outcomes[0].rows !== rows
    )
      throw Error("Publisher summary scope differs");
    validateRolloutCounts(report.outcomes[0].counts, rows);
    return report.outcomes[0].counts as RolloutCounts;
  };
  const deadline = Date.now() + waitSeconds * 1000;
  await save();
  do {
    await verifyBinding();
    for (const season of seasons) {
      if (season.state === "future") continue;
      const current = outcomes.get(season.nhlSeason)!;
      if (
        [
          "published",
          "unchanged",
          "dry-run-ready",
          "local-verified",
          "checkpoint-ready",
        ].includes(current.status)
      )
        continue;
      let bytes: Buffer;
      try {
        const path = resolve(checkpoints, `${season.nhlSeason}-ready.json`);
        bytes = await readFile(path);
        await sleep(100);
        if (!bytes.equals(await readFile(path))) continue;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        outcomes.set(season.nhlSeason, {
          ...current,
          status: "failed",
          stage: "read-checkpoint",
          reason: "Checkpoint could not be read",
        });
        await save();
        continue;
      }
      const checkpointSha256 = hash(bytes);
      if (attempted.get(season.nhlSeason) === checkpointSha256) continue;
      let checkpoint: ReadyCheckpoint;
      try {
        checkpoint = JSON.parse(bytes.toString()) as ReadyCheckpoint;
      } catch {
        outcomes.set(season.nhlSeason, {
          ...current,
          status: "pending",
          reason:
            "Checkpoint producer write incomplete; awaiting valid stable JSON",
        });
        continue;
      }
      attempted.set(season.nhlSeason, checkpointSha256);
      const attempt = resolve(runRoot, `${season.nhlSeason}-${event}`);
      const next: Outcome = {
        ...current,
        checkpointSha256,
        attempt,
        stage: "validate-checkpoint",
      };
      try {
        validateRolloutCheckpoint(checkpoint, season, policySha256);
        if (values["plan-only"]) {
          outcomes.set(season.nhlSeason, {
            ...next,
            status: "checkpoint-ready",
            reason:
              "Identity/hash declarations verified; native artifacts not replayed",
          });
          await save();
          continue;
        }
        await mkdir(attempt);
        await writeFile(resolve(attempt, "checkpoint-source.json"), bytes, {
          flag: "wx",
        });
        const buildRoot = resolve(attempt, "build");
        await mkdir(buildRoot);
        await writeFile(
          resolve(buildRoot, `${season.nhlSeason}-ready.json`),
          bytes,
          { flag: "wx" },
        );
        next.stage = "verify-single-season-native-reuse";
        const buildExit = await child("rebuild-nhl-hockey-overall.ts", [
          "--inventory",
          inventoryPath,
          "--output",
          buildRoot,
          "--season",
          String(season.nhlSeason),
        ]);
        if (buildExit !== 0) {
          next.exitCode = buildExit;
          throw Error("Verified checkpoint reuse failed");
        }
        const buildSummary = resolve(buildRoot, "summary.json");
        const summaryBytes = await readFile(buildSummary);
        const summarySha256 = hash(summaryBytes);
        const built = JSON.parse(summaryBytes.toString());
        if (
          built.seasons.length !== 1 ||
          built.seasons[0].status !== "ready" ||
          built.seasons[0].nhlSeason !== season.nhlSeason ||
          built.inventory.sha256 !== inventorySha256 ||
          built.policy.sha256 !== policySha256
        )
          throw Error("Single-season reused summary differs");
        for (const key of Object.keys(checkpoint.artifacts))
          if (
            stableJson(built.seasons[0][key]) !==
            stableJson(checkpoint.artifacts[key])
          )
            throw Error(
              "Verified reuse no longer matches checkpoint artifact identity",
            );
        next.stage = "publisher-dry-run";
        const dryRoot = resolve(attempt, "dry-run");
        const dryExit = await publisher(
          buildSummary,
          dryRoot,
          season,
          summarySha256,
        );
        if (dryExit !== 0) {
          next.exitCode = dryExit;
          throw Error("Publisher dry-run failed");
        }
        const plan = JSON.parse(
          await readFile(resolve(dryRoot, "plan.json"), "utf8"),
        );
        const rows = validateRolloutPublicationScope(
          plan,
          season,
          policySha256,
          inventorySha256,
          values["local-only"],
        );
        next.rows = rows;
        if (values["local-only"]) {
          outcomes.set(season.nhlSeason, {
            ...next,
            status: "local-verified",
            reason:
              "Native artifacts and exact namespace verified without production access",
          });
          await save();
          continue;
        }
        const dryCounts = await publicationCounts(dryRoot, season, rows, false);
        next.counts = dryCounts;
        if (validateRolloutCounts(dryCounts, rows) === "unchanged") {
          outcomes.set(season.nhlSeason, {
            ...next,
            status: "unchanged",
            stage: "complete",
          });
          await save();
          continue;
        }
        if (!values.apply) {
          outcomes.set(season.nhlSeason, {
            ...next,
            status: "dry-run-ready",
            stage: "complete",
          });
          await save();
          continue;
        }
        next.stage = "publisher-apply";
        const applyRoot = resolve(attempt, "apply");
        const applyExit = await publisher(
          buildSummary,
          applyRoot,
          season,
          summarySha256,
          true,
        );
        if (applyExit !== 0) {
          next.exitCode = applyExit;
          throw Error(
            "Publisher apply failed; any completed batches retained for exact resume",
          );
        }
        const applied = await publicationCounts(applyRoot, season, rows, true);
        validateRolloutPlanIdentity(
          plan,
          JSON.parse(await readFile(resolve(applyRoot, "plan.json"), "utf8")),
        );
        next.stage = "verify-all-unchanged";
        const verifyRoot = resolve(attempt, "verify");
        const verifyExit = await publisher(
          buildSummary,
          verifyRoot,
          season,
          summarySha256,
        );
        if (verifyExit !== 0) {
          next.exitCode = verifyExit;
          throw Error("Post-apply verification failed");
        }
        validateRolloutPlanIdentity(
          plan,
          JSON.parse(await readFile(resolve(verifyRoot, "plan.json"), "utf8")),
        );
        const verified = await publicationCounts(
          verifyRoot,
          season,
          rows,
          false,
        );
        if (validateRolloutCounts(verified, rows) !== "unchanged")
          throw Error("Post-apply season is not fully unchanged");
        outcomes.set(season.nhlSeason, {
          ...next,
          counts: applied,
          status: applied.inserted > 0 ? "published" : "unchanged",
          stage: "complete",
        });
      } catch {
        outcomes.set(season.nhlSeason, {
          ...next,
          status: "failed",
          reason:
            "Season operation failed; inspect its bounded local builder/publisher evidence; other ready seasons continue",
        });
      }
      await save();
      console.log(JSON.stringify(outcomes.get(season.nhlSeason)));
    }
    if (
      values["plan-only"] ||
      ![...outcomes.values()].some(
        (entry) => entry.state !== "future" && entry.status === "pending",
      ) ||
      Date.now() >= deadline
    )
      break;
    await sleep(
      Math.min(pollSeconds * 1000, Math.max(0, deadline - Date.now())),
    );
  } while (Date.now() <= deadline);
  await verifyBinding();
  const unfinished = await save();
  console.log(
    JSON.stringify({
      output,
      runId,
      apply: values.apply,
      localOnly: values["local-only"],
      planOnly: values["plan-only"],
      unfinishedNonfutureSeasons: unfinished,
      futurePendingSeasons: 2,
    }),
  );
  if (unfinished) process.exitCode = 1;
}
