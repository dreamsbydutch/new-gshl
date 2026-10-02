import { readFile, writeFile, mkdir, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve, relative, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, isDeepStrictEqual } from "node:util";
import { prepareGameValuePublication } from "../../domains/nhl/game-value-publication";
import type { GameSeasonRating } from "../../runtime/nhl-game-season-value";

const { values } = parseArgs({
  options: {
    target: { type: "string" },
    output: { type: "string" },
    plan: { type: "string" },
    baseline: { type: "string" },
    report: { type: "string" },
    "backup-dir": { type: "string" },
    "source-review": { type: "string" },
    apply: { type: "boolean" },
    help: { type: "boolean" },
  },
});
const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
const root = resolve(import.meta.dirname, "../../../..");
async function convex(args: string[]) {
  const cli = resolve(root, "node_modules/convex/bin/main.js");
  return new Promise<unknown>((accept, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-"], {
      cwd: root,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr));
      else {
        try {
          accept(JSON.parse(stdout));
        } catch {
          reject(new Error("Invalid Convex response"));
        }
      }
    });
    child.stdin.end(
      `process.argv=${JSON.stringify([process.execPath, cli, "run", "--deployment", "polished-tern-709", "--codegen", "disable", "--typecheck", "disable", ...args])};await import(${JSON.stringify(pathToFileURL(cli).href)});`,
    );
  });
}
if (values.help)
  console.log(
    "Finalize only the reviewed 2019-20 v3 snapshot on polished-tern-709. Prepare: --target production --baseline <v2 root> --report <20192020 fitted directory> --source-review <review.json> --backup-dir <independent directory outside workspace/OneDrive> --output <NEW directory>. Preparation reads production, verifies calculation provenance, and writes two hash-verified backups plus a plan; no database writes. Review/apply: --target production --plan <plan.json> --output <NEW directory> [--apply]. Dry run is default. Scores/exposure/components are preserved; qualified ranks restored, limitations retained, routine imports locked. No GSHL changes.",
  );
else {
  if (values.target !== "production" || !values.output)
    throw new Error("Explicit production target and new output required");
  const output = resolve(values.output);
  await mkdir(output);
  if (values.plan) {
    const plan = JSON.parse(await readFile(resolve(values.plan), "utf8")) as {
      target: string;
      backup: string;
      args: { review: { backupSha256: string }; [key: string]: unknown };
    };
    if (plan.target !== "polished-tern-709")
      throw new Error("Wrong planned target");
    if (
      digest(await readFile(plan.backup, "utf8")) !==
      plan.args.review.backupSha256
    )
      throw new Error("Independent backup verification failed");
    const result = await convex([
      "nhlSeasonValueFinalization:finalize2019",
      JSON.stringify({ ...plan.args, apply: Boolean(values.apply) }),
    ]);
    await writeFile(
      resolve(output, "result.json"),
      JSON.stringify(result, null, 2),
      { flag: "wx" },
    );
    console.log(JSON.stringify(result));
  } else {
    if (
      values.apply ||
      !values.baseline ||
      !values.report ||
      !values["backup-dir"] ||
      !values["source-review"]
    )
      throw new Error(
        "Preparation requires baseline, report, source review, independent backup, and no apply",
      );
    const baseline = resolve(values.baseline),
      reportRoot = resolve(values.report);
    const summary = JSON.parse(
      await readFile(resolve(baseline, "summary.json"), "utf8"),
    ) as { seasons: { id: string; nhlSeason: number }[] };
    const season = summary.seasons.find((s) => s.nhlSeason === 20192020);
    if (!season) throw new Error("Missing 2019-20 identity");
    const query = `const season=await ctx.db.get(${JSON.stringify(season.id)});if(!season||String(season.year)!=="2020")throw new Error("Wrong season");return await ctx.db.query("nhlSeasonValues").withIndex("by_identity",q=>q.eq("seasonId",${JSON.stringify(season.id)}).eq("gameType",2).eq("profile","core").eq("modelVersion","nhl-season-value-v3")).take(1001);`;
    const rows = (await convex(["--inline-query", query])) as Array<{
      nhlPlayerId: number;
      sourceHash: string;
      gameValue: { warnings: string[] };
      [key: string]: unknown;
    }>;
    if (
      rows.length !== 970 ||
      new Set(rows.map((r) => r.nhlPlayerId)).size !== 970
    )
      throw new Error("Production population mismatch");
    const reason = rows[0]!.gameValue.warnings
      .find((w) => w.startsWith("Provisional season publication: "))
      ?.slice("Provisional season publication: ".length);
    if (!reason)
      throw new Error(
        "Expected the published provisional snapshot; use saved plan for replay",
      );
    const sourceText = await readFile(
        resolve(baseline, "20192020/source.json"),
        "utf8",
      ),
      priorText = await readFile(
        resolve(baseline, "20192020/ratings.json"),
        "utf8",
      );
    const reportText = await readFile(
        resolve(reportRoot, "ratings.json"),
        "utf8",
      ),
      auditText = await readFile(
        resolve(reportRoot, "game-audit.json"),
        "utf8",
      );
    const verified = prepareGameValuePublication({
      season: 20192020,
      sourceText,
      priorText,
      reportText,
      auditText,
      provisionalReason: reason,
    });
    for (const expected of verified.results) {
      const row = rows.find((r) => r.nhlPlayerId === expected.nhlPlayerId)!;
      if (
        row.sourceHash !== verified.metadata.sourceHash ||
        Object.entries(expected).some(
          ([key, value]) => !isDeepStrictEqual(row[key], value),
        )
      )
        throw new Error(
          `Stored calculation differs for ${expected.nhlPlayerId}`,
        );
    }
    const report = JSON.parse(reportText) as {
      ratings: GameSeasonRating[];
      qualityGate: {
        gates: Record<string, boolean>;
        sourceCoverage: {
          processFraction: number;
          individualShotFraction: number;
        };
      };
    };
    const sourceReviewText = await readFile(
      resolve(values["source-review"]),
      "utf8",
    );
    const sourceReview = JSON.parse(sourceReviewText) as {
      results: {
        beforeSeconds?: number;
        afterSeconds?: number;
        error?: string;
      }[];
    };
    if (
      sourceReview.results.length < 20 ||
      sourceReview.results.some(
        (r) =>
          r.error ||
          r.afterSeconds === undefined ||
          r.beforeSeconds === undefined ||
          r.afterSeconds > r.beforeSeconds,
      )
    )
      throw new Error(
        "Unresolved source-review improvements/errors; reconcile before finalizing",
      );
    const backupDirectory = resolve(values["backup-dir"]);
    await mkdir(backupDirectory, { recursive: true });
    const resolvedBackup = await realpath(backupDirectory),
      rel = relative(await realpath(root), resolvedBackup);
    if (
      (!rel.startsWith("..") && !isAbsolute(rel)) ||
      /onedrive/i.test(resolvedBackup)
    )
      throw new Error(
        "Backup must be independent of the workspace and OneDrive",
      );
    const snapshot = JSON.stringify(
        { target: "polished-tern-709", season: 20192020, rows },
        null,
        2,
      ),
      backupSha256 = digest(snapshot);
    const backup = resolve(
      resolvedBackup,
      `nhl-20192020-before-finalization-${Date.now()}.json`,
    );
    await writeFile(backup, snapshot, { flag: "wx" });
    await writeFile(resolve(output, "before.json"), snapshot, { flag: "wx" });
    if (
      digest(await readFile(backup, "utf8")) !== backupSha256 ||
      digest(await readFile(resolve(output, "before.json"), "utf8")) !==
        backupSha256
    )
      throw new Error("Backup read-back failed");
    const review = {
      state: "final-with-limitations",
      reviewedAt: Date.now(),
      backupSha256,
      reportSha256: digest(reportText),
      reason:
        "Final user-reviewed 2019-20 regular season. All 970 players and played games retained. Rechecked the 20 largest lineup gaps against official alternate reports; no trustworthy exposure recovered. Preserve the documented coverage and held-out prediction limitations; retain individual qualification rules.",
      failedGates: Object.entries(report.qualityGate.gates)
        .filter(([, pass]) => !pass)
        .map(([key]) => key),
      processCoverage: report.qualityGate.sourceCoverage.processFraction,
      shotCoverage: report.qualityGate.sourceCoverage.individualShotFraction,
    };
    const plan = {
      target: "polished-tern-709",
      backup,
      sourceReviewSha256: digest(sourceReviewText),
      args: {
        seasonId: season.id,
        expectedSourceHash: verified.metadata.sourceHash,
        qualifiedPlayerIds: report.ratings
          .filter((p) => p.status === "rated")
          .map((p) => p.playerId)
          .sort((a, b) => a - b),
        review: {
          ...review,
          reviewHash: digest(
            JSON.stringify({
              review,
              sourceReviewSha256: digest(sourceReviewText),
            }),
          ),
        },
      },
    };
    await writeFile(
      resolve(output, "plan.json"),
      JSON.stringify(plan, null, 2),
      { flag: "wx" },
    );
    console.log(
      JSON.stringify({
        target: plan.target,
        players: rows.length,
        rated: plan.args.qualifiedPlayerIds.length,
        backup,
        backupSha256,
        plan: resolve(output, "plan.json"),
      }),
    );
  }
}
