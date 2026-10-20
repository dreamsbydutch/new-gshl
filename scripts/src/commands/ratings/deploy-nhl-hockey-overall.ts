import { spawn } from "node:child_process";
import { mkdir, readFile, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { runHockeyOverallDeploymentWorker } from "../../integrations/nhl/hockey-overall-deployment";

const { values } = parseArgs({
  options: {
    worktree: { type: "string" },
    output: { type: "string" },
    target: { type: "string" },
    deployment: { type: "string" },
    "reviewed-plan": { type: "string" },
    "schema-scope": { type: "string", default: "hockey-overall" },
    "include-rating-facades": { type: "boolean", default: false },
    apply: { type: "boolean", default: false },
    worker: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});
if (values.help) {
  console.log(
    "Usage: deploy-nhl-hockey-overall.ts --target production --deployment polished-tern-709 --worktree PATH --output NEW_JSON [--schema-scope hockey-overall|dual-ratings|season-stat-cleanup|gshl-impact-ratings|nightly-stats] [--include-rating-facades] [--apply --reviewed-plan SUCCESSFUL_DRY_RUN_JSON]\nDefault: dry-run, strict hockey-overall schema scope. Dual-ratings permits only optional playerNhlStatLines.hockeyRating while preserving the existing nhlSeasonValues schema exactly. Season-stat-cleanup permits only optional GS and preserves all existing fields including hockeyRating. GSHL impact permits only optional averageRating/ratingVersion/ratingAppearances metadata on the nine GSHL statline tables plus highlights; only gshlImpactRatings.js deploys unless --include-rating-facades explicitly adds frontend.js, weeklyEditions.js, performances.js and matchup.js. Nightly-stats permits only optional nullable player native-source timestamp/hash and the exact new NHL team season summary table; nightlyNhlStats.js and its native field validators deploy. Scope and facade roots are bound to the reviewed dry run. Uses official Convex analysis/schema/finish protocol while preserving live unrelated modules. Raw authenticated diagnostics are suppressed. Run scoped backend typechecks independently before deployment.",
  );
} else {
  if (
    !values.worktree ||
    !values.output ||
    values.target !== "production" ||
    values.deployment !== "polished-tern-709" ||
    (values.apply && !values["reviewed-plan"])
  )
    throw Error("Explicit production target, worktree and output are required");
  const schemaScope = values["schema-scope"];
  if (
    schemaScope !== "hockey-overall" &&
    schemaScope !== "dual-ratings" &&
    schemaScope !== "season-stat-cleanup" &&
    schemaScope !== "nightly-stats" &&
    schemaScope !== "gshl-impact-ratings"
  )
    throw Error("Unsupported deployment schema scope");
  if (values["include-rating-facades"] && schemaScope !== "gshl-impact-ratings")
    throw Error("Rating facades require explicit GSHL impact scope");
  const root = fileURLToPath(new URL("../../../../", import.meta.url));
  const output = resolve(values.output);
  if (values.worker) {
    await runHockeyOverallDeploymentWorker({
      root,
      worktree: resolve(values.worktree),
      output,
      apply: values.apply,
      schemaScope,
      includeRatingFacades: values["include-rating-facades"],
      reviewedPlan: values["reviewed-plan"]
        ? resolve(values["reviewed-plan"])
        : undefined,
    });
  } else {
    try {
      await access(output);
      throw Error(
        "Output already exists; preserve previous deployment evidence",
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await mkdir(dirname(output), { recursive: true });
    const exit = await new Promise<number | null>((accept, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--use-system-ca",
          "--import",
          "tsx",
          fileURLToPath(import.meta.url),
          ...process.argv.slice(2),
          "--worker",
        ],
        { cwd: root, windowsHide: true, stdio: "ignore" },
      );
      child.on("error", () =>
        reject(Error("Deployment worker failed to start")),
      );
      child.on("close", accept);
    });
    const report = JSON.parse(await readFile(output, "utf8"));
    if (
      exit !== 0 ||
      !report.finished ||
      !report.schemaScopeVerified ||
      !report.baselineReverified
    )
      throw Error("Deployment overlay failed; inspect safe summary artifact");
    console.log(
      JSON.stringify({
        deployment: values.deployment,
        dryRun: !values.apply,
        schemaScope,
        output,
        changedModules: report.plan.changedModules,
        unchangedModuleCount: report.plan.unchangedModuleCount,
      }),
    );
  }
}
