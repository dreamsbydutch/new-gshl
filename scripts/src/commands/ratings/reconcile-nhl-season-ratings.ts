import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  assertDualRatingPreservation,
  canonicalRatingJson,
  prepareDualRatingEntries,
  selectNhlRatingSeasons,
} from "../../domains/nhl/dual-ratings";
import {
  dualRatingDeployment,
  readDualRatingSeasons,
  runDualRatingConvex,
  type DualRatingSeason,
} from "../../integrations/nhl/dual-ratings";
import {
  verifyDualRatingSourceFingerprint,
  type OfficialRatingSource,
} from "../../domains/nhl/dual-rating-source-proof";

const { values } = parseArgs({
  options: {
    target: { type: "string" },
    deployment: { type: "string" },
    output: { type: "string" },
    input: { type: "string" },
    "season-ids": { type: "string" },
    "identity-review": { type: "string" },
    "reviewed-plan": { type: "string" },
    backup: { type: "string" },
    apply: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});
const sha = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
type Reconciliation = {
  apply: boolean;
  matched: number;
  changed: number;
  updated: number;
  unchanged: number;
  rows: Array<{
    statLineId: string;
    hockeyRating: Record<string, unknown>;
    changed: boolean;
    seasonRatingChanged: boolean;
    fantasySeasonRating?: number;
  }>;
};
function validateReconciliation(
  response: unknown,
  ids: string[],
  apply: boolean,
): asserts response is Reconciliation {
  const value = response as Reconciliation;
  if (
    !value ||
    value.apply !== apply ||
    value.matched !== ids.length ||
    !Array.isArray(value.rows) ||
    canonicalRatingJson(value.rows.map((r) => r.statLineId)) !==
      canonicalRatingJson(ids) ||
    value.changed !== value.rows.filter((r) => r.changed).length ||
    value.unchanged !== ids.length - value.changed ||
    value.updated !== (apply ? value.changed : 0) ||
    value.rows.some(
      (r) =>
        !r.hockeyRating ||
        r.hockeyRating.modelVersion !== "nhl-hockey-overall-reviewed-v1",
    )
  )
    throw Error("Invalid reconciliation response");
}
if (values.help) {
  console.log(
    "Optional --season-ids <comma-separated canonical season IDs> scopes planning, preflight, apply and verification to those seasons; unknown or duplicate IDs fail closed.",
  );
  console.log(
    "Usage: reconcile-nhl-season-ratings.ts --target production --deployment polished-tern-709 --output NEW_DIRECTORY [--input SNAPSHOT_JSON] [--identity-review HASH_BOUND_REVIEW_JSON] [--apply --reviewed-plan DRY_RUN_PLAN_JSON --backup INDEPENDENT_BEFORE_JSON]. Defaults to dry-run. Replays GSHL PlayerNHL season scores and associates every existing NHL stat line with the reviewed replacement-based hockey model or an explicit unavailable status. Reviewed source bindings require independent exact-stat fingerprint evidence; they do not repair player identities. Patches only seasonRating and hockeyRating; preserves source stats, overallRating, salary, timestamps, and all nhlSeasonValues. Bounded season reads, 100-row batches, all-batch preflight, optimistic concurrency checks, exact post-read verification. Apply requires the exact reviewed snapshot and independent backup bytes.",
  );
} else {
  if (
    values.target !== "production" ||
    values.deployment !== dualRatingDeployment ||
    !values.output ||
    (values.apply && (!values["reviewed-plan"] || !values.backup))
  )
    throw Error(
      "Explicit production identity, new output, and reviewed plan/independent backup for apply required",
    );
  const output = resolve(values.output);
  await mkdir(output);
  const save = (name: string, value: unknown) =>
    writeFile(resolve(output, name), JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
    });
  let seasons: DualRatingSeason[];
  let reviewed: Record<string, unknown> | undefined;
  if (values.apply) {
    reviewed = JSON.parse(
      await readFile(resolve(values["reviewed-plan"]!), "utf8"),
    ) as Record<string, unknown>;
    if (
      reviewed.deployment !== dualRatingDeployment ||
      reviewed.version !== "nhl-dual-rating-plan-v1"
    )
      throw Error("Wrong reviewed plan");
    const backupBytes = await readFile(resolve(values.backup!));
    if (sha(backupBytes) !== reviewed.snapshotSha256)
      throw Error("Independent backup differs from reviewed snapshot");
    const backupPath = resolve(values.backup!);
    const workspace = resolve(".");
    if (
      backupPath.toLowerCase().startsWith(workspace.toLowerCase() + "\\") ||
      /[\\/]onedrive[\\/]/i.test(backupPath)
    )
      throw Error("Backup must be outside workspace and OneDrive");
    seasons = (
      JSON.parse(backupBytes.toString()) as { seasons: DualRatingSeason[] }
    ).seasons;
  } else if (values.input) {
    seasons = (
      JSON.parse(await readFile(resolve(values.input), "utf8")) as {
        seasons: DualRatingSeason[];
      }
    ).seasons;
  } else seasons = await readDualRatingSeasons();
  const requestedSeasons = values["season-ids"]?.split(",");
  seasons = selectNhlRatingSeasons(seasons, requestedSeasons);
  const snapshotText =
    JSON.stringify({ deployment: dualRatingDeployment, seasons }, null, 2) +
    "\n";
  await writeFile(resolve(output, "before.json"), snapshotText, { flag: "wx" });
  const entries = await prepareDualRatingEntries(seasons);
  let identityReviewSha256: string | null = null;
  const overrides = new Map<
    string,
    { sourceId: string; reviewHash: string; reason: string }
  >();
  const reviewedNhlIds = new Map<string, number>();
  if (values["identity-review"]) {
    const bytes = await readFile(resolve(values["identity-review"]));
    identityReviewSha256 = sha(bytes);
    const review = JSON.parse(bytes.toString()) as {
      version: string;
      overrides: Array<{
        statLineId: string;
        sourceId: string;
        reason: string;
        expectedRowSha256: string;
        nhlPlayerId: number;
        evidence: {
          canonicalSourcePath: string;
          canonicalSourceSha256: string;
          teamConflictReason?: string;
          corroboratingLegacyStatIds?: string[];
          missingFields?: string[];
        };
      }>;
    };
    if (
      review.version !== "nhl-dual-rating-identity-review-v1" ||
      !Array.isArray(review.overrides)
    )
      throw Error("Invalid identity review artifact");
    const byId = new Map(entries.map((e) => [e.statLineId, e]));
    const sources = new Map(
      seasons.flatMap((s) =>
        (
          (s as DualRatingSeason & { values?: Array<Record<string, unknown>> })
            .values ?? []
        ).map((row) => [String(row._id), row] as const),
      ),
    );
    const nativeSources = new Map<string, OfficialRatingSource>();
    for (const override of review.overrides) {
      const entry = byId.get(override.statLineId);
      if (
        !entry ||
        overrides.has(override.statLineId) ||
        sha(canonicalRatingJson(entry.expectedRow)) !==
          override.expectedRowSha256 ||
        !override.sourceId ||
        !override.reason
      )
        throw Error("Identity review differs from exact reviewed stat line");
      const source = sources.get(override.sourceId);
      if (
        !source ||
        source.seasonId !== entry.expectedRow.seasonId ||
        source.nhlPlayerId !== override.nhlPlayerId ||
        source.modelVersion !== "nhl-hockey-overall-reviewed-v1" ||
        (source.hockeyOverall as { sourceArtifactHash?: string })
          ?.sourceArtifactHash !== override.evidence.canonicalSourceSha256
      )
        throw Error(
          "Identity review source is not bound to published hockey evidence",
        );
      const sourceCacheKey = `${override.evidence.canonicalSourcePath}:${override.evidence.canonicalSourceSha256}`;
      let native = nativeSources.get(sourceCacheKey);
      if (!native) {
        const sourceBytes = await readFile(
          resolve(override.evidence.canonicalSourcePath),
        );
        if (sha(sourceBytes) !== override.evidence.canonicalSourceSha256)
          throw Error("Official source artifact bytes differ");
        native = JSON.parse(sourceBytes.toString()) as OfficialRatingSource;
        nativeSources.set(sourceCacheKey, native);
      }
      if (override.evidence.teamConflictReason) {
        const peers = override.evidence.corroboratingLegacyStatIds ?? [];
        if (
          new Set(peers).size < 2 ||
          !override.reason.includes(override.evidence.teamConflictReason) ||
          peers.some((id) => {
            const peer = review.overrides.find((r) => r.statLineId === id);
            return (
              !peer ||
              peer.nhlPlayerId !== override.nhlPlayerId ||
              peer.evidence.teamConflictReason ||
              byId.get(id)?.expectedRow.playerId !== entry.expectedRow.playerId
            );
          })
        )
          throw Error(
            "Conflicting team evidence lacks independent exact legacy-season corroboration",
          );
      }
      verifyDualRatingSourceFingerprint(
        entry.expectedRow,
        override.nhlPlayerId,
        native,
        override.evidence.teamConflictReason,
        override.evidence.missingFields,
      );
      overrides.set(override.statLineId, {
        sourceId: override.sourceId,
        reviewHash: identityReviewSha256,
        reason: override.reason,
      });
      reviewedNhlIds.set(override.statLineId, override.nhlPlayerId);
    }
  }
  const reviewedEntries = entries.map((entry) => ({
    ...entry,
    ...(overrides.has(entry.statLineId)
      ? { reviewedSource: overrides.get(entry.statLineId) }
      : {}),
  }));
  if (!entries.length) throw Error("No NHL stat lines selected");
  const codePaths = [
    "scripts/src/commands/ratings/reconcile-nhl-season-ratings.ts",
    "scripts/src/domains/nhl/dual-ratings.ts",
    "scripts/src/domains/nhl/dual-rating-source-proof.ts",
    "scripts/src/integrations/nhl/dual-ratings.ts",
    "scripts/src/domains/ranking/ranking-engine.ts",
    ...["config.js", "player-pure.js", "team-pure.js", "index.js"].map(
      (name) => `scripts/src/runtime/RankingEngine/${name}`,
    ),
  ];
  const codeHashes = await Promise.all(
    codePaths.map(async (path) => ({
      path,
      sha256: sha(await readFile(path)),
    })),
  );
  const plan = {
    version: "nhl-dual-rating-plan-v1",
    deployment: dualRatingDeployment,
    snapshotSha256: sha(snapshotText),
    entriesSha256: sha(canonicalRatingJson(reviewedEntries)),
    identityReviewSha256,
    codeHashes,
    seasons: seasons.map((s) => ({
      id: s.season._id,
      name: s.season.name,
      rows: s.stats.length,
    })),
    rows: entries.length,
    fantasyChanges: entries.filter(
      (e) => e.expectedSeasonRating !== e.fantasySeasonRating,
    ).length,
  };
  if (reviewed && canonicalRatingJson(plan) !== canonicalRatingJson(reviewed))
    throw Error("Apply differs from reviewed snapshot, code, scores or scope");
  await save("plan.json", plan);
  const batches = Array.from(
    { length: Math.ceil(entries.length / 100) },
    (_, index) => reviewedEntries.slice(index * 100, (index + 1) * 100),
  );
  async function runBatches(apply: boolean) {
    const results: Reconciliation[] = [];
    for (let start = 0; start < batches.length; start += 3) {
      const responses = await Promise.all(
        batches
          .slice(start, start + 3)
          .map((entries) =>
            runDualRatingConvex([
              "nhlSeasonValues:reconcileStatLineRatings",
              JSON.stringify({ entries, apply }),
            ]),
          ),
      );
      responses.forEach((response, index) =>
        validateReconciliation(
          response,
          batches[start + index].map((e) => e.statLineId),
          apply,
        ),
      );
      for (const response of responses as Reconciliation[])
        for (const row of response.rows) {
          const binding = overrides.get(row.statLineId);
          if (
            binding &&
            (row.hockeyRating.sourceId !== binding.sourceId ||
              row.hockeyRating.nhlPlayerId !==
                reviewedNhlIds.get(row.statLineId) ||
              row.hockeyRating.identityReviewHash !== binding.reviewHash ||
              row.hockeyRating.identityResolution !== "reviewed-source")
          )
            throw Error(
              "Live reviewed source identity differs from verified official fingerprint",
            );
        }
      results.push(...(responses as Reconciliation[]));
      console.log(
        JSON.stringify({
          stage: apply ? "apply" : "preflight",
          batches: results.length,
          totalBatches: batches.length,
        }),
      );
    }
    return results;
  }
  const preflight = await runBatches(false);
  await save("preflight.json", preflight);
  if (values.apply) {
    const liveBefore = selectNhlRatingSeasons(
      await readDualRatingSeasons(),
      requestedSeasons,
    );
    const scope = (input: DualRatingSeason[]) =>
      input
        .map((s) => ({
          season: s.season,
          stats: [...s.stats].sort((a, b) => a._id.localeCompare(b._id)),
        }))
        .sort((a, b) => a.season._id.localeCompare(b.season._id));
    if (
      canonicalRatingJson(scope(liveBefore)) !==
      canonicalRatingJson(scope(seasons))
    )
      throw Error(
        "Live season/stat population or reviewed fields changed before apply",
      );
    const reviewedPreflight = JSON.parse(
      await readFile(
        resolve(dirname(values["reviewed-plan"]!), "preflight.json"),
        "utf8",
      ),
    );
    if (
      canonicalRatingJson(preflight) !== canonicalRatingJson(reviewedPreflight)
    )
      throw Error("Production associations differ from reviewed dry run");
    const applied = await runBatches(true);
    if (
      canonicalRatingJson(applied.map((r) => r.rows)) !==
      canonicalRatingJson(preflight.map((r) => r.rows))
    )
      throw Error("Production associations changed during apply");
    await save("applied.json", applied);
    const after = selectNhlRatingSeasons(
      await readDualRatingSeasons(),
      requestedSeasons,
    );
    if (
      canonicalRatingJson(
        after.map((s) => s.season).sort((a, b) => a._id.localeCompare(b._id)),
      ) !==
      canonicalRatingJson(
        seasons.map((s) => s.season).sort((a, b) => a._id.localeCompare(b._id)),
      )
    )
      throw Error("Season inventory changed");
    const beforeRows = seasons.flatMap((s) => s.stats),
      afterRows = after.flatMap((s) => s.stats);
    assertDualRatingPreservation(beforeRows, afterRows);
    const expected = new Map(
      entries.map((e) => [e.statLineId, e.fantasySeasonRating]),
    );
    const expectedHockey = new Map(
      preflight.flatMap((r) =>
        r.rows.map((row) => [row.statLineId, row.hockeyRating] as const),
      ),
    );
    for (const row of afterRows)
      if (
        row.seasonRating !== expected.get(row._id) ||
        canonicalRatingJson(row.hockeyRating) !==
          canonicalRatingJson(expectedHockey.get(row._id))
      )
        throw Error("Missing or differing dual rating after apply");
    await save("after.json", {
      deployment: dualRatingDeployment,
      seasons: after,
    });
    const replayEntries = (await prepareDualRatingEntries(after)).map(
      (entry) => ({
        ...entry,
        ...(overrides.has(entry.statLineId)
          ? { reviewedSource: overrides.get(entry.statLineId) }
          : {}),
      }),
    );
    const replay: Reconciliation[] = [];
    for (let start = 0; start < replayEntries.length; start += 300) {
      const chunks = [0, 100, 200]
        .map((offset) =>
          replayEntries.slice(start + offset, start + offset + 100),
        )
        .filter((chunk) => chunk.length);
      const responses = await Promise.all(
        chunks.map((entries) =>
          runDualRatingConvex([
            "nhlSeasonValues:reconcileStatLineRatings",
            JSON.stringify({ entries, apply: false }),
          ]),
        ),
      );
      responses.forEach((response, index) => {
        validateReconciliation(
          response,
          chunks[index].map((e) => e.statLineId),
          false,
        );
        if (response.changed !== 0)
          throw Error("Dual rating reconciliation is not idempotent");
        replay.push(response);
      });
      console.log(
        JSON.stringify({
          stage: "idempotency",
          rows: Math.min(start + 300, replayEntries.length),
          total: replayEntries.length,
        }),
      );
    }
    await save("idempotency.json", replay);
  }
  await save("summary.json", {
    ...plan,
    qualifications: Object.fromEntries(
      [
        ...new Set(
          preflight.flatMap((batch) =>
            batch.rows.map((row) => String(row.hockeyRating.qualification)),
          ),
        ),
      ]
        .sort()
        .map((status) => [
          status,
          preflight
            .flatMap((batch) => batch.rows)
            .filter((row) => row.hockeyRating.qualification === status).length,
        ]),
    ),
    linkedHockeySources: preflight
      .flatMap((batch) => batch.rows)
      .filter((row) => row.hockeyRating.sourceId).length,
    reviewedIdentityBindings: overrides.size,
    changed: preflight.reduce((sum, batch) => sum + batch.changed, 0),
    apply: values.apply,
    completedAt: new Date().toISOString(),
    passed: true,
  });
  console.log(
    JSON.stringify({
      rows: entries.length,
      fantasyChanges: plan.fantasyChanges,
      apply: values.apply,
      output,
    }),
  );
}
