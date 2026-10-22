import { parseArgs } from "node:util";
import { readFile, mkdir, writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { HockeyDataCache } from "../../integrations/nhl/game-value-source";
import { fetchGamePlayByPlay } from "../../integrations/nhl/game-value-source";
import {
  collectReviewedUnavailableShiftProof,
  loadReviewedUnavailableShifts,
  unavailableShiftParserBinding,
} from "../../integrations/nhl/unavailable-shift-source";
import {
  UNAVAILABLE_SHIFT_GAME_IDS,
  type UnavailableShiftProof,
} from "../../domains/nhl/unavailable-shift-proof";

const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
async function main() {
  const { values } = parseArgs({
    options: {
      cache: { type: "string" },
      "review-evidence": { type: "string" },
      output: { type: "string" },
      apply: { type: "boolean", default: false },
      "reviewed-plan": { type: "string" },
      "reviewed-plan-sha256": { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "Review fully downloaded but unusable NHL shifts (offline; local cache only).\n--cache DIR --review-evidence JSON --output NEW_DIR [--apply --reviewed-plan JSON --reviewed-plan-sha256 SHA256]\nEvidence JSON: {proofs:UnavailableShiftProof[],evidenceFiles:[{path,sha256}]}. All source bodies must already be cached. Defaults to dry-run; no network, model fit or database access.",
    );
    return;
  }
  if (!values.cache || !values["review-evidence"] || !values.output)
    throw new Error("--cache, --review-evidence and --output are required");
  if (
    (values.apply &&
      (!values["reviewed-plan"] || !values["reviewed-plan-sha256"])) ||
    (!values.apply &&
      Boolean(values["reviewed-plan"] || values["reviewed-plan-sha256"]))
  )
    throw new Error(
      "Apply requires the exact reviewed plan and SHA; dry-run cannot supply apply bindings",
    );
  const output = resolve(values.output);
  try {
    await access(output);
    throw new Error("Output must be a new directory");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const reviewPath = resolve(values["review-evidence"]),
    reviewBytes = await readFile(reviewPath);
  const review = JSON.parse(reviewBytes.toString("utf8")) as {
    proofs: UnavailableShiftProof[];
    evidenceFiles: Array<{ path: string; sha256: string }>;
  };
  if (
    !Array.isArray(review.proofs) ||
    !review.proofs.length ||
    review.proofs.length > UNAVAILABLE_SHIFT_GAME_IDS.length ||
    new Set(review.proofs.map((p) => p.gameId)).size !== review.proofs.length ||
    !Array.isArray(review.evidenceFiles) ||
    !review.evidenceFiles.length
  )
    throw new Error("Invalid bounded reviewed evidence input");
  const evidenceFiles: Array<{ path: string; sha256: string }> = [];
  for (const file of review.evidenceFiles) {
    if (
      typeof file.path !== "string" ||
      !file.path.endsWith(".json") ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    )
      throw new Error("Invalid review evidence file binding");
    const path = resolve(file.path),
      bytes = await readFile(path);
    if (hash(bytes) !== file.sha256)
      throw new Error("Review evidence file bytes changed");
    evidenceFiles.push({ path, sha256: file.sha256 });
  }
  if (
    review.proofs.some(
      (p) => !evidenceFiles.some((f) => f.sha256 === p.review.evidenceSha256),
    )
  )
    throw new Error("Every proof must bind a retained reviewed evidence file");
  const cacheDirectory = resolve(values.cache),
    cache = new HockeyDataCache(cacheDirectory, true);
  const parserBinding = await unavailableShiftParserBinding();
  const commandPath = fileURLToPath(import.meta.url),
    commandSha256 = hash(await readFile(commandPath));
  const prepared = [];
  for (const proof of review.proofs) {
    const pbp = await fetchGamePlayByPlay(cache, proof.gameId);
    const sources = await loadReviewedUnavailableShifts(cache, proof, pbp);
    prepared.push({ proof, pbp, availability: sources.shiftAvailability });
  }
  const plan = {
    version: "nhl-unavailable-shift-review-plan-v1",
    offlineOnly: true,
    localCacheOnly: true,
    cacheDirectory,
    reviewEvidence: { path: reviewPath, sha256: hash(reviewBytes) },
    evidenceFiles,
    parserBinding,
    command: { path: commandPath, sha256: commandSha256 },
    proofs: review.proofs,
    availability: prepared.map((p) => p.availability),
  };
  const planText = JSON.stringify(plan, null, 2) + "\n",
    planSha256 = hash(planText);
  if (values.apply) {
    const prior = await readFile(resolve(values["reviewed-plan"]!));
    if (
      hash(prior) !== values["reviewed-plan-sha256"] ||
      prior.toString("utf8") !== planText
    )
      throw new Error(
        "Exact reviewed plan no longer matches replayed inputs/code",
      );
  }
  if (
    hash(await readFile(reviewPath)) !== hash(reviewBytes) ||
    hash(await readFile(commandPath)) !== commandSha256 ||
    (await unavailableShiftParserBinding()).sha256 !== parserBinding.sha256
  )
    throw new Error("Review input/code changed during preflight");
  for (const file of evidenceFiles)
    if (hash(await readFile(file.path)) !== file.sha256)
      throw new Error("Review evidence changed during preflight");
  // Replay every proof before the first immutable cache write. Collection replays again.
  if (values.apply)
    for (const item of prepared)
      await collectReviewedUnavailableShiftProof(cache, item.proof, item.pbp);
  await mkdir(output, { recursive: false });
  await writeFile(resolve(output, "plan.json"), planText, { flag: "wx" });
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(
      {
        version: "nhl-unavailable-shift-review-result-v1",
        passed: true,
        apply: values.apply,
        planSha256,
        games: prepared.map((p) => p.proof.gameId),
        productionOperations: 0,
        networkOperations: 0,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      passed: true,
      apply: values.apply,
      games: prepared.length,
      planSha256,
      output,
    }),
  );
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Unavailable-shift review failed",
  );
  process.exitCode = 1;
});
