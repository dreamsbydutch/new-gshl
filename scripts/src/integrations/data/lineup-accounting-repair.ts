import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { capturedCli } from "./production-operator-cli";

type PlanFile = { path: string; table: string; rows: number; sha256: string };
type Change = {
  id: string;
  expected: Record<string, unknown>;
  patch: Record<string, unknown>;
};
type Result = {
  total: number;
  updated: number;
  wouldUpdate: number;
  already: number;
};
const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
function containedFile(directory: string, name: string): string {
  const target = path.resolve(directory, name);
  const relative = path.relative(directory, target);
  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    path.isAbsolute(name)
  )
    throw Error("Plan file outside reviewed directory");
  return target;
}

/** Apply reviewed flag-only plans; never retry a conflict or overwrite a newer row. */
export async function replayLineupAccountingPlan(options: {
  plan: string;
  backup?: string;
  apply: boolean;
  verify: boolean;
}): Promise<Result> {
  const directory = path.resolve(options.plan);
  const manifestBytes = readFileSync(path.join(directory, "manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString()) as {
    deployment: string;
    issues: number;
    files: PlanFile[];
    sourceManifestSha256: string;
    scheduleSha256: string;
    gameLogEvidenceSha256?: string;
    sourceRefreshManifestSha256?: string;
  };
  if (
    manifest.deployment !== "polished-tern-709" ||
    manifest.issues !== 0 ||
    !Array.isArray(manifest.files)
  )
    throw Error("Unresolved or unsupported accounting repair plan");
  if (options.apply) {
    if (!options.backup) throw Error("Verified independent backup required");
    const backup = path.resolve(options.backup);
    const repository = fileURLToPath(new URL("../../../../", import.meta.url));
    const relativeBackup = path.relative(repository, backup);
    if (
      (!relativeBackup.startsWith("..") && !path.isAbsolute(relativeBackup)) ||
      /onedrive/i.test(backup)
    )
      throw Error("Backup must be independent of the workspace and OneDrive");
    if (
      digest(readFileSync(path.join(backup, "plan", "manifest.json"))) !==
      digest(manifestBytes)
    )
      throw Error("Independent backup manifest differs");
    // Read back every independently copied source and plan file before any writes.
    const sourceBytes = readFileSync(
      path.join(backup, "snapshot", "manifest.json"),
    );
    if (digest(sourceBytes) !== manifest.sourceManifestSha256)
      throw Error("Independent source manifest differs");
    const scheduleBytes = readFileSync(
      path.join(backup, "nhl-schedule-index.json"),
    );
    if (digest(scheduleBytes) !== manifest.scheduleSha256)
      throw Error("Independent NHL schedule index differs");
    const schedule = JSON.parse(scheduleBytes.toString()) as {
      sourceDirectory: string;
      sources: Array<{ path: string; sha256: string }>;
    };
    for (const file of schedule.sources)
      if (
        digest(
          readFileSync(
            containedFile(
              containedFile(backup, schedule.sourceDirectory),
              file.path,
            ),
          ),
        ) !== file.sha256
      )
        throw Error("Independent NHL evidence checksum mismatch");
    const source = JSON.parse(sourceBytes.toString()) as {
      files: Array<{ path: string; sha256: string }>;
    };
    if (manifest.gameLogEvidenceSha256) {
      const logDirectory = path.join(backup, "player-game-logs");
      const logManifest = readFileSync(
        path.join(logDirectory, "manifest.json"),
      );
      if (digest(logManifest) !== manifest.gameLogEvidenceSha256)
        throw Error("Independent player game-log manifest differs");
      const logs = JSON.parse(logManifest.toString()) as {
        sources: Array<{ path: string; sha256: string }>;
      };
      for (const file of logs.sources)
        if (
          digest(readFileSync(containedFile(logDirectory, file.path))) !==
          file.sha256
        )
          throw Error("Independent player game-log evidence differs");
    }
    if (manifest.sourceRefreshManifestSha256) {
      const sourceDirectory = path.join(backup, "plan", "source-refresh");
      const bytes = readFileSync(path.join(sourceDirectory, "manifest.json"));
      if (digest(bytes) !== manifest.sourceRefreshManifestSha256)
        throw Error("Independent refreshed source manifest differs");
      const refreshed = JSON.parse(bytes.toString()) as {
        files: Array<{ path: string; sha256: string }>;
      };
      for (const file of refreshed.files)
        if (
          digest(readFileSync(containedFile(sourceDirectory, file.path))) !==
          file.sha256
        )
          throw Error("Independent refreshed source evidence differs");
    }
    for (const file of source.files)
      if (
        digest(
          readFileSync(containedFile(path.join(backup, "snapshot"), file.path)),
        ) !== file.sha256
      )
        throw Error("Independent source backup checksum mismatch");
    for (const file of manifest.files)
      if (
        digest(
          readFileSync(containedFile(path.join(backup, "plan"), file.path)),
        ) !== file.sha256
      )
        throw Error("Independent plan backup checksum mismatch");
  }
  const batches: Array<{ table: string; rows: Change[] }> = [];
  const identities = new Set<string>();
  for (const file of manifest.files) {
    const bytes = readFileSync(containedFile(directory, file.path));
    if (digest(bytes) !== file.sha256)
      throw Error("Reviewed plan checksum mismatch");
    const rows = JSON.parse(bytes.toString()) as Change[];
    if (!Array.isArray(rows) || rows.length !== file.rows)
      throw Error("Reviewed plan population mismatch");
    for (const row of rows) {
      const key = JSON.stringify([file.table, row.id]);
      if (identities.has(key))
        throw Error("Duplicate accounting source identity");
      identities.add(key);
    }
    for (let i = 0; i < rows.length; i += 50)
      batches.push({ table: file.table, rows: rows.slice(i, i + 50) });
  }
  const secret = (
    await capturedCli([
      "env",
      "get",
      "CONVEX_SERVER_SECRET",
      "--deployment",
      manifest.deployment,
    ])
  ).trim();
  if (!secret || /[\r\n]/.test(secret))
    throw Error("Production credential unavailable");
  const client = new ConvexHttpClient(
    "https://polished-tern-709.convex.cloud",
    { logger: false },
  );
  const call = async (
    batch: (typeof batches)[number],
    apply: boolean,
  ): Promise<Result> => {
    for (let attempt = 0; attempt < 3; attempt++)
      try {
        return (await client.mutation(
          makeFunctionReference<"mutation">("lineupAccounting:applyBatch"),
          { ...batch, serverSecret: secret, apply },
          { skipQueue: true },
        )) as Result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const conflict =
          /preimage|source row missing|Unauthorized|Invalid|Unsupported|validation/i.test(
            message,
          );
        const transient =
          /fetch failed|network|socket|ECONN|ETIMEDOUT|timed? out|too many (?:concurrent|requests)|\b(?:429|502|503|504)\b|internal server error|overload/i.test(
            message,
          );
        if (!conflict && transient && attempt < 2) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * (attempt + 1)),
          );
          continue;
        }
        throw Error(
          `Accounting ${apply ? "apply" : "preflight"} failed for ${batch.table}/${batch.rows[0]?.id} (${conflict ? "source or validation conflict" : transient ? "transient request" : "request failure"}); authenticated diagnostics suppressed`,
        );
      }
    throw Error("Accounting request retry limit reached");
  };
  const sum = (): Result => ({
    total: 0,
    updated: 0,
    wouldUpdate: 0,
    already: 0,
  });
  const preflight = sum();
  // Validate the complete plan before the first mutation; every apply rechecks its preimage.
  for (let offset = 0; offset < batches.length; offset += 3) {
    const results = await Promise.allSettled(
      batches.slice(offset, offset + 3).map((batch) => call(batch, false)),
    );
    const failures: unknown[] = [];
    for (const result of results) {
      if (result.status === "rejected") {
        failures.push(result.reason);
        continue;
      }
      for (const key of Object.keys(preflight) as Array<keyof Result>)
        preflight[key] += result.value[key];
    }
    if (failures.length) throw failures[0];
    if (offset % 300 === 0)
      console.log(
        JSON.stringify({
          phase: "preflight-progress",
          batches: Math.min(offset + 3, batches.length),
          totalBatches: batches.length,
        }),
      );
  }
  console.log(
    JSON.stringify({
      phase: "preflight",
      deployment: manifest.deployment,
      ...preflight,
    }),
  );
  if (options.verify && preflight.wouldUpdate)
    throw Error("Accounting verification has unapplied changes");
  if (!options.apply) return preflight;
  const applied = sum();
  // Identities are disjoint across batches. Bound concurrent transactions and
  // inspect the whole group before stopping, so an interrupted run is resumable.
  for (let i = 0; i < batches.length; i += 3) {
    const results = await Promise.allSettled(
      batches.slice(i, i + 3).map((batch) => call(batch, true)),
    );
    const failures: unknown[] = [];
    for (const result of results) {
      if (result.status === "rejected") {
        failures.push(result.reason);
        continue;
      }
      for (const key of Object.keys(applied) as Array<keyof Result>)
        applied[key] += result.value[key];
    }
    if (failures.length) throw failures[0];
    if (i % 300 === 0)
      console.log(
        JSON.stringify({
          phase: "apply",
          batches: Math.min(i + 3, batches.length),
          totalBatches: batches.length,
          updated: applied.updated,
        }),
      );
  }
  return applied;
}
