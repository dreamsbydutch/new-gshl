import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRetrospectiveValueContext } from "./retrospective-value-context";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
async function fixture(
  run: (
    paths: {
      root: string;
      baseline: string;
      sourceManifest: string;
      policy: string;
    },
    manifest: Record<string, unknown>,
  ) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), "nhl-retrospective-source-test-"));
  try {
    const baseline = join(root, "baseline");
    await mkdir(join(baseline, "20252026"), { recursive: true });
    const source = '{"nhl":{"season":20252026,"gameType":2}}';
    const priors = '{"calibration":{}}';
    await writeFile(join(baseline, "20252026/source.json"), source);
    await writeFile(join(baseline, "20252026/ratings.json"), priors);
    const ledger = [{ gameId: 2025020001, sha256: "source" }];
    const manifest = {
      version: "nhl-retrospective-source-manifest-v1",
      publishable: false,
      season: 20252026,
      gameType: 2,
      officialTeamCount: 32,
      officialGames: 1,
      loadedGames: 1,
      gameSourceHashes: ledger,
      gameSourcesHash: hash(JSON.stringify(ledger)),
      canonicalSourceSha256: hash(source),
      abilityPriorsSha256: hash(priors),
      passesSourceGates: true,
      sourceAuditSha256: hash("{}"),
      sourcePreparationCodeHashes: [
        { path: "test-fixture", sha256: hash("fixture") },
      ],
      sourceGates: {
        officialSeasonExposureMatches: true,
        completeDownload: true,
        atLeast98PercentProcessExposureVerified: true,
        atLeast98PercentIndividualShotsVerified: true,
      },
      penaltyShotModel: {
        fromSeason: 20202021,
        beforeSeason: 20252026,
        gameType: 2,
        probability: 0.5,
      },
    };
    const sourceManifest = join(root, "source-manifest.json"),
      policy = join(root, "policy.md");
    await writeFile(sourceManifest, JSON.stringify(manifest));
    await writeFile(join(root, "game-audit.json"), "{}");
    await writeFile(policy, "Status: **SEALED unit-test fixture**");
    await run({ root, baseline, sourceManifest, policy }, manifest);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("source-only context fixes lambda and preserves absence of chronological models", async () => {
  await fixture(async (paths) => {
    const context = await loadRetrospectiveValueContext(paths);
    assert.equal(context.mode, "source-manifest-two-way");
    assert.deepEqual(context.lambdas, { glm: 4, gb: 4 });
    assert.equal(context.original, null);
    assert.equal(context.frozen, null);
    assert.equal(
      context.policySha256,
      hash("Status: **SEALED unit-test fixture**"),
    );
  });
});

test("draft policy, empty source gates and mixed input modes cannot authorize a source-only fit", async () => {
  await fixture(async (paths, manifest) => {
    await writeFile(paths.policy, "Status: **DRAFT**");
    await assert.rejects(loadRetrospectiveValueContext(paths), /SEALED/);
    await writeFile(paths.policy, "Status: **SEALED unit-test fixture**");
    await writeFile(
      paths.sourceManifest,
      JSON.stringify({ ...manifest, sourceGates: {} }),
    );
    await assert.rejects(
      loadRetrospectiveValueContext(paths),
      /passing source-only/,
    );
    await assert.rejects(
      loadRetrospectiveValueContext({ ...paths, report: "unrelated" }),
      /exactly one/,
    );
    await assert.rejects(
      loadRetrospectiveValueContext({
        ...paths,
        chronologicalImpact: "unrelated",
      }),
      /forbids chronological/,
    );
  });
});

test("changed canonical priors or current-season penalty-shot baseline are rejected", async () => {
  await fixture(async (paths, manifest) => {
    await writeFile(
      join(paths.baseline, "20252026/ratings.json"),
      '{"calibration":{"changed":true}}',
    );
    await assert.rejects(
      loadRetrospectiveValueContext(paths),
      /prior hashes differ/,
    );
    await writeFile(
      join(paths.baseline, "20252026/ratings.json"),
      '{"calibration":{}}',
    );
    await writeFile(
      paths.sourceManifest,
      JSON.stringify({
        ...manifest,
        penaltyShotModel: {
          fromSeason: 20252026,
          beforeSeason: 20252026,
          gameType: 2,
          probability: 0.5,
        },
      }),
    );
    await assert.rejects(
      loadRetrospectiveValueContext(paths),
      /independent past-season/,
    );
  });
});

test("changed physical audit cannot retain the source-manifest admission", async () => {
  await fixture(async (paths) => {
    await writeFile(join(paths.root, "game-audit.json"), '{"changed":true}');
    await assert.rejects(
      loadRetrospectiveValueContext(paths),
      /physical audit/,
    );
  });
});
