import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const command = fileURLToPath(
  new URL("./repair-player-day-stat-gaps.ts", import.meta.url),
);
const sha = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
type FixtureOptions = {
  fields?: Record<string, unknown>;
  old?: Record<string, unknown>;
  badEvidence?: boolean;
  badBackup?: boolean;
  id?: string;
  duplicate?: boolean;
  deployment?: string;
  corrections?: boolean;
  review?: Record<string, unknown>;
  sourceCount?: number;
  unofficialSource?: boolean;
  unboundSources?: boolean;
  count?: number;
  reviewedFlag?: boolean;
};
/** Every case must reject before any live query or writer is constructed. */
async function rejected(options: FixtureOptions, message: RegExp) {
  const dir = await mkdtemp(resolve(tmpdir(), "gshl-player-day-reject-"));
  try {
    const row = {
      _id: "row",
      weekId: "week",
      seasonId: "season",
      playerId: "player",
      gshlTeamId: "team",
      date: "2025-01-01",
      GP: 1,
      G: null,
      ...options.old,
    };
    const sourceFiles = Array.from(
      { length: options.sourceCount ?? 2 },
      (_, i) => ({
        path: resolve(dir, `source-${i}.json`),
        sha256: sha("{}"),
        url: options.unofficialSource
          ? `https://example.com/source/${i}`
          : i === 0
            ? "https://api.nhle.com/stats/rest/en/skater/summary"
            : "https://api-web.nhle.com/v1/gamecenter/2025020001/boxscore",
      }),
    );
    const op = {
      id: options.id ?? row._id,
      expectedRow: row,
      fields: options.fields ?? { G: 0 },
      ...(options.corrections
        ? { evidence: sourceFiles, ...options.review }
        : {}),
    };
    const plan =
      (options.count
        ? Array.from({ length: options.count }, (_, i) => ({
            ...op,
            id: `row-${i}`,
          }))
        : [op, ...(options.duplicate ? [op] : [])]
      )
        .map((o) => JSON.stringify(o))
        .join("\n") + "\n";
    const planPath = resolve(dir, "plan.jsonl"),
      evidencePath = resolve(dir, "evidence.json"),
      backupPath = resolve(dir, "backup.json"),
      output = resolve(dir, "output");
    const saved = JSON.stringify([row]);
    const evidenceText = JSON.stringify({
      files: [
        {
          path: planPath,
          sha256: options.badEvidence ? "0".repeat(64) : sha(plan),
        },
        ...(options.corrections && !options.unboundSources
          ? sourceFiles.map(({ path, sha256 }) => ({ path, sha256 }))
          : []),
      ],
    });
    const backupText = JSON.stringify({
      deployment: "polished-tern-709",
      passed: true,
      files: [
        {
          file: "weeks/one.json",
          sha256: options.badBackup ? "0".repeat(64) : sha(saved),
        },
      ],
    });
    await mkdir(resolve(dir, "weeks"));
    await Promise.all([
      writeFile(planPath, plan),
      writeFile(resolve(dir, "weeks/one.json"), saved),
      writeFile(evidencePath, evidenceText),
      writeFile(backupPath, backupText),
      ...sourceFiles.map((f) => writeFile(f.path, "{}")),
    ]);
    const reviewedPath = resolve(dir, "reviewed.json");
    if (options.reviewedFlag !== undefined) {
      const codePaths = [
        "scripts/src/commands/stats/repair-player-day-stat-gaps.ts",
        "scripts/src/integrations/data/production-operator-cli.ts",
      ];
      const codeHashes = await Promise.all(
        codePaths.map(async (path) => ({
          path,
          sha256: sha((await readFile(path)).toString()),
        })),
      );
      await writeFile(
        reviewedPath,
        JSON.stringify({
          deployment: "polished-tern-709",
          planSha256: sha(plan),
          evidenceSha256: sha(evidenceText),
          allowReviewedNativeCorrections: options.reviewedFlag,
          backupSha256: sha(backupText),
          codeHashes,
        }),
      );
    }
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        command,
        "--deployment",
        options.deployment ?? "polished-tern-709",
        "--plan",
        planPath,
        "--evidence-manifest",
        evidencePath,
        "--backup-manifest",
        backupPath,
        "--output",
        output,
        ...(options.corrections ? ["--allow-reviewed-native-corrections"] : []),
        ...(options.reviewedFlag !== undefined
          ? ["--apply", "--reviewed-plan", reviewedPath]
          : []),
      ],
      { encoding: "utf8", windowsHide: true, timeout: 15000 },
    );
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, message);
    assert.equal(
      existsSync(output),
      false,
      "validation must fail before preflight/query/output stages",
    );
  } finally {
    assert.equal(dirname(dir), resolve(tmpdir()));
    await rm(dir, { recursive: true, force: true });
  }
}
void test("wrong deployment and mismatched source-plan bytes fail locally", async () => {
  await rejected({ deployment: "other" }, /Exact deployment/);
  await rejected({ badEvidence: true }, /Evidence does not bind/);
  await rejected({ badBackup: true }, /backup readback differs/);
});
void test("refuses duplicate IDs, ID/preimage mismatch, and empty patches", async () => {
  await rejected({ duplicate: true }, /Distinct, bounded/);
  await rejected({ id: "other" }, /independently backed-up full row/);
  await rejected({ fields: {} }, /independently backed-up full row/);
});
void test("native corrections and roster/ownership/timestamp edits cannot masquerade as missing-stat repairs", async () => {
  await rejected({ old: { G: 0 }, fields: { G: 1 } }, /missing finite numeric/);
  for (const fields of [
    { dailyPos: "C" },
    { playerId: "other" },
    { gshlTeamId: "other" },
    { updatedAt: 123 },
  ])
    await rejected({ fields }, /Unapproved field/);
});
void test("daily domains reject invented appearances, fractional or negative counts, and save percentages above one", async () => {
  for (const GP of [0, 2, 1.5])
    await rejected({ old: { GP: null }, fields: { GP } }, /valid daily domain/);
  for (const G of [-1, 0.5])
    await rejected({ fields: { G } }, /valid daily domain/);
  await rejected({ fields: { SVP: 1.1 } }, /valid daily domain/);
  await rejected({ fields: { G: null } }, /missing finite numeric/);
});
void test("derived flags require missing-GP restoration and valid fantasy values; Rating requires a native restoration", async () => {
  await rejected({ fields: { GS: 1 } }, /unsupported derived repair/);
  await rejected(
    { old: { GP: null }, fields: { GP: 1, GS: 2 } },
    /valid fantasy flags/,
  );
  await rejected(
    { old: { GP: null }, fields: { GP: 1, IR: "1" } },
    /valid fantasy flags/,
  );
  await rejected(
    { fields: { Rating: "80" } },
    /supported gameplay restoration/,
  );
  await rejected(
    { fields: { G: 0, Rating: "unknown" } },
    /supported gameplay restoration/,
  );
});

const review = {
  requiresAtomicSameRowWrite: true,
  independentFieldAgreement: { G: { summary: 0, boxscore: 0 } },
};
void test("explicit correction mode requires bounded atomic review and two hash-bound official sources", async () => {
  await rejected({ corrections: true }, /atomic two-source/);
  await rejected(
    {
      corrections: true,
      review: { ...review, requiresAtomicSameRowWrite: false },
    },
    /atomic two-source/,
  );
  await rejected(
    { corrections: true, review, sourceCount: 1 },
    /atomic two-source/,
  );
  await rejected(
    { corrections: true, review, unofficialSource: true },
    /hash-bound official evidence/,
  );
  await rejected(
    { corrections: true, review, unboundSources: true },
    /hash-bound official evidence/,
  );
  await rejected({ corrections: true, review, count: 26 }, /limited to 25/);
});
void test("correction values cannot bypass per-field agreement and complete goalie workload consistency", async () => {
  await rejected(
    { corrections: true, review: { ...review, independentFieldAgreement: {} } },
    /lacks field agreement/,
  );
  await rejected(
    {
      corrections: true,
      review: {
        ...review,
        independentFieldAgreement: { G: { summary: 0, boxscore: 1 } },
      },
    },
    /source values disagree/,
  );
  await rejected(
    { corrections: true, old: { posGroup: "G" }, fields: { GA: 1 }, review },
    /complete workload and rates/,
  );
  const fields = {
    W: 1,
    GA: 1,
    SV: 26,
    SA: 27,
    TOI: 3869 / 60,
    GAA: 0.93047,
    SVP: 0.96296,
  };
  await rejected(
    {
      corrections: true,
      old: { posGroup: "G" },
      fields: { ...fields, SA: 28 },
      review,
    },
    /complete workload and rates/,
  );
  await rejected(
    {
      corrections: true,
      old: { posGroup: "G" },
      fields: { ...fields, GAA: 2 },
      review,
    },
    /complete workload and rates/,
  );
  await rejected(
    {
      corrections: true,
      fields: { TOI: 60 },
      review: {
        ...review,
        independentFieldAgreement: {
          TOI: {
            targetMinutes: 60,
            summarySeconds: 3600,
            boxscoreSeconds: 3599,
          },
        },
      },
    },
    /source values disagree/,
  );
  await rejected(
    {
      corrections: true,
      fields: { SVP: 0.9 },
      review: {
        ...review,
        independentFieldAgreement: {
          SVP: { summary: 0.9, round5Matches: false },
        },
      },
    },
    /source values disagree/,
  );
});
void test("reviewed apply binding cannot switch from missing-only into native corrections", async () => {
  await rejected(
    {
      corrections: true,
      old: { G: 1 },
      fields: { G: 0 },
      review,
      reviewedFlag: false,
    },
    /Apply differs from reviewed/,
  );
});
