import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { brotliCompressSync, brotliDecompressSync } from "node:zlib";
import {
  assertDeploymentSchemaChange,
  assertDeploymentIndexChanges,
  auditBuiltinOnlyNodeModules,
  composeDeploymentOverlay,
  deploymentRootsForScope,
  moduleDigest,
  NodeDependencyProofError,
  stableJson,
  type DeploymentModule,
  type DeploymentModuleHash,
  type DeploymentSchemaScope,
} from "../../domains/nhl/hockey-overall-deployment";

const deployment = "polished-tern-709";
const digest = (value: unknown) =>
  createHash("sha256").update(stableJson(value)).digest("hex");
type Baseline = {
  config: Record<string, unknown>;
  moduleHashes: DeploymentModuleHash[];
  nodeDependencies?: unknown[];
  nodeVersion?: string | null;
  udfServerVersion: string;
};

/** Runs only in a child process. Authenticated CLI output is never forwarded. */
export async function runHockeyOverallDeploymentWorker(options: {
  root: string;
  worktree: string;
  output: string;
  apply: boolean;
  reviewedPlan?: string;
  schemaScope?: DeploymentSchemaScope;
  includeRatingFacades?: boolean;
}) {
  const schemaScope = options.schemaScope ?? "hockey-overall";
  if (
    schemaScope !== "hockey-overall" &&
    schemaScope !== "dual-ratings" &&
    schemaScope !== "season-stat-cleanup" &&
    schemaScope !== "nightly-stats" &&
    schemaScope !== "gshl-impact-ratings"
  )
    throw Error("Unsupported deployment schema scope");
  const roots = deploymentRootsForScope(
    schemaScope,
    options.includeRatingFacades,
  );
  process.stdout.write = () => true;
  process.stderr.write = () => true;
  const summary: Record<string, unknown> = {
    version: "nhl-hockey-overall-deployment-overlay-v1",
    deployment,
    dryRun: !options.apply,
    schemaScope,
    finished: false,
    baselineReverified: false,
    schemaScopeVerified: false,
  };
  process.once("exit", (exitCode) => {
    writeFileSync(
      options.output,
      JSON.stringify({ ...summary, exitCode }, null, 2) + "\n",
      { flag: "wx" },
    );
  });
  const realFetch = globalThis.fetch;
  const sourceFiles = [
    "scripts/src/domains/nhl/hockey-overall-deployment.ts",
    "scripts/src/integrations/nhl/hockey-overall-deployment.ts",
    "scripts/src/commands/ratings/deploy-nhl-hockey-overall.ts",
  ];
  const codeHashes = () =>
    sourceFiles.map((path) => ({
      path,
      sha256: createHash("sha256")
        .update(readFileSync(resolve(options.root, path)))
        .digest("hex"),
    }));
  const startupCodeHashes = codeHashes();
  summary.toolCodeHashes = startupCodeHashes;
  let baseline: Baseline | undefined;
  let remote: DeploymentModule[] = [];
  let schema: unknown;
  let pendingSchema: unknown;
  let proposedSchema: unknown;
  let schemaReadRequest: { url: string; options: RequestInit };
  let baselineSha256: string;
  let privateRead: { url: string; options: RequestInit };
  const baselineHash = (value: Baseline) =>
    digest({
      ...value,
      moduleHashes: [...value.moduleHashes].sort((a, b) =>
        a.path.localeCompare(b.path),
      ),
    });
  const intercept: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    const pathname = url.pathname;
    if (
      pathname.startsWith("/api/deploy2/") ||
      pathname === "/api/get_config_hashes"
    ) {
      if (url.hostname !== `${deployment}.convex.cloud`)
        throw Error("Deployment overlay target mismatch");
    }
    if (pathname === "/api/get_config_hashes" && !baseline) {
      summary.stage = "read-production-module-hashes";
      const response = await realFetch(input, init);
      if (!response.ok) throw Error("Production baseline read failed");
      baseline = (await response.clone().json()) as Baseline;
      summary.nodeDependencyMetadata = {
        type: typeof baseline.nodeDependencies,
        array: Array.isArray(baseline.nodeDependencies),
        null: baseline.nodeDependencies === null,
      };
      baselineSha256 = baselineHash(baseline);
      privateRead = { url: url.href, options: init ?? {} };
      summary.stage = "read-production-module-sources";
      const sourceUrl = new URL(url);
      sourceUrl.pathname = "/api/get_config";
      const sourceResponse = await realFetch(sourceUrl, init);
      if (!sourceResponse.ok) throw Error("Production module read failed");
      const sourceResult = (await sourceResponse.json()) as {
        modules: DeploymentModule[];
      };
      remote = sourceResult.modules;
      const { adminKey } = JSON.parse(String(init?.body)) as {
        adminKey: string;
      };
      const schemaUrl = new URL(url);
      schemaUrl.pathname = "/api/query";
      summary.stage = "read-active-schema";
      schemaReadRequest = {
        url: schemaUrl.href,
        options: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Convex ${adminKey}`,
          },
          body: JSON.stringify({
            path: "_system/frontend/getSchemas:default",
            args: [{}],
            format: "convex_encoded_json",
          }),
        },
      };
      const schemaResponse = await realFetch(
        schemaReadRequest.url,
        schemaReadRequest.options,
      );
      const schemaResult = (await schemaResponse.json()) as {
        status: string;
        value?: { active?: string; inProgress?: string };
      };
      summary.schemaRead = {
        httpStatus: schemaResponse.status,
        success: schemaResult.status === "success",
        activePresent: !!schemaResult.value?.active,
        inProgressPresent: !!schemaResult.value?.inProgress,
      };
      if (
        !schemaResponse.ok ||
        schemaResult.status !== "success" ||
        !schemaResult.value?.active
      )
        throw Error(
          "Active schema unavailable or concurrent schema in progress",
        );
      schema = JSON.parse(schemaResult.value.active);
      if (schemaResult.value.inProgress) {
        pendingSchema = JSON.parse(schemaResult.value.inProgress);
        if (schemaScope === "nightly-stats") {
          const tables = (
            pendingSchema as {
              tables: {
                tableName: string;
                documentType?: { value?: Record<string, unknown> };
              }[];
            }
          ).tables;
          const fields =
            tables.find((t) => t.tableName === "playerNhlStatLines")
              ?.documentType?.value ?? {};
          summary.nightlyPendingSchema = {
            teamTable:
              tables.find((t) => t.tableName === "nhlTeamSeasonStatLines") ??
              null,
            provenance: {
              nhlStatsSourceFetchedAt: fields.nhlStatsSourceFetchedAt ?? null,
              nhlStatsSourceSha256: fields.nhlStatsSourceSha256 ?? null,
            },
          };
        }
        assertDeploymentSchemaChange(schema, pendingSchema, schemaScope);
        summary.existingPendingSchemaSha256 = digest(pendingSchema);
      }
      summary.stage = "production-baseline-ready";
      return response;
    }
    if (
      pathname === "/api/deploy2/start_push" ||
      pathname === "/api/deploy2/evaluate_push"
    ) {
      summary.stage = "compose-allowlisted-overlay";
      if (!baseline || !schema || !init?.body)
        throw Error("Missing verified production baseline");
      const request = JSON.parse(
        brotliDecompressSync(init.body as Uint8Array).toString(),
      );
      summary.requestFieldNames = Object.keys(request).sort();
      summary.appDefinitionFieldNames = Object.keys(
        request.appDefinition,
      ).sort();
      if (
        Object.keys(request).some(
          (key) =>
            ![
              "adminKey",
              "dryRun",
              "functions",
              "appDefinition",
              "componentDefinitions",
              "nodeDependencies",
              "nodeVersion",
              "forCodegen",
            ].includes(key),
        ) ||
        Object.keys(request.appDefinition).some(
          (key) =>
            ![
              "definition",
              "dependencies",
              "schema",
              "changedModules",
              "unchangedModuleHashes",
              "udfServerVersion",
            ].includes(key),
        )
      )
        throw Error("Unexpected deployment request fields");
      if (
        request.dryRun !== !options.apply ||
        (request.forCodegen !== undefined && request.forCodegen !== false) ||
        request.componentDefinitions.length !== 0 ||
        request.appDefinition.dependencies.length !== 0
      )
        throw Error("Unexpected deployment mode or component changes");
      const explicitLocal = [
        ...request.appDefinition.changedModules,
      ] as DeploymentModule[];
      for (const path of roots) {
        if (explicitLocal.some((module) => module.path === path)) continue;
        const unchanged = request.appDefinition.unchangedModuleHashes.find(
          (module: { path: string; sha256: string }) => module.path === path,
        );
        const original = remote.find((module) => module.path === path);
        if (
          !unchanged ||
          !original ||
          unchanged.sha256 !== moduleDigest(original)
        )
          throw Error("Missing explicit reviewed deployment entrypoint");
        explicitLocal.push(original);
      }
      const overlay = composeDeploymentOverlay({
        remote,
        remoteHashes: baseline.moduleHashes,
        localChanged: explicitLocal,
        schema: request.appDefinition.schema,
        schemaScope,
        includeRatingFacades: options.includeRatingFacades,
      });
      Object.assign(request.appDefinition, overlay, {
        udfServerVersion: baseline.udfServerVersion,
      });
      if (baseline.nodeDependencies === undefined) {
        summary.stage = "verify-builtin-only-node-dependencies";
        if (
          !Array.isArray(request.nodeDependencies) ||
          request.nodeDependencies.length !== 0 ||
          overlay.changedModules.some((module) => module.environment === "node")
        )
          throw Error(
            "Node changes or requested dependencies prevent preservation proof",
          );
        const esbuild = await import(
          pathToFileURL(
            resolve(options.root, "node_modules/esbuild/lib/main.js"),
          ).href
        );
        const fixtures = [false, true].map(
          (minify) =>
            esbuild.buildSync({
              stdin: {
                contents: "export const sample=require('node:crypto')",
                resolveDir: options.root,
              },
              bundle: true,
              platform: "node",
              format: "esm",
              write: false,
              logLevel: "silent",
              minify,
            }).outputFiles[0].text as string,
        );
        summary.compilerRequireFixtureSha256 = fixtures.map((fixture) =>
          digest(fixture),
        );
        summary.nodeDependencyProof = auditBuiltinOnlyNodeModules(
          remote,
          fixtures,
        );
        request.nodeDependencies = [];
      } else {
        if (!Array.isArray(baseline.nodeDependencies))
          throw Error("Invalid production Node dependency metadata");
        request.nodeDependencies = baseline.nodeDependencies;
      }
      if (baseline.nodeVersion) request.nodeVersion = baseline.nodeVersion;
      else delete request.nodeVersion;
      if (typeof baseline.config.functions === "string")
        request.functions = baseline.config.functions;
      const plan = {
        schemaScope,
        includeRatingFacades: options.includeRatingFacades === true,
        deploymentRoots: roots,
        toolCodeHashes: startupCodeHashes,
        compilerRequireFixtureSha256:
          summary.compilerRequireFixtureSha256 ?? null,
        baselineSha256,
        changedModules: overlay.changedModules.map((module) => ({
          path: module.path,
          sha256: moduleDigest(module),
        })),
        unchangedModuleCount: overlay.unchangedModuleHashes.length,
        unchangedModuleHashesSha256: digest(overlay.unchangedModuleHashes),
        schemaSha256: moduleDigest(overlay.schema),
        definitionSha256: moduleDigest(overlay.definition),
        nodeConfigSha256: digest({
          dependencies: request.nodeDependencies,
          version: request.nodeVersion ?? null,
          runtime: request.appDefinition.udfServerVersion,
        }),
        permittedSchemaField:
          schemaScope === "nightly-stats"
            ? "playerNhlStatLines optional nullable nhlStatsSourceFetchedAt/nhlStatsSourceSha256; new exact nhlTeamSeasonStatLines summary; all other schema unchanged"
            : schemaScope === "gshl-impact-ratings"
              ? "averageRating/ratingVersion/ratingAppearances optional nullable metadata on nine GSHL statline tables and playerDayHighlights only; Rating unchanged"
              : schemaScope === "season-stat-cleanup"
                ? "playerNhlStatLines.GS (optional); all existing schema unchanged"
                : schemaScope === "dual-ratings"
                  ? "playerNhlStatLines.hockeyRating (optional); nhlSeasonValues unchanged"
                  : "nhlSeasonValues.hockeyOverall (optional)",
      };
      summary.plan = plan;
      if (options.apply) {
        if (!options.reviewedPlan) throw Error("Apply requires reviewed plan");
        const reviewed = JSON.parse(readFileSync(options.reviewedPlan, "utf8"));
        if (
          reviewed.dryRun !== true ||
          reviewed.finished !== true ||
          reviewed.exitCode !== 0 ||
          stableJson(reviewed.plan) !== stableJson(plan)
        )
          throw Error("Apply differs from reviewed successful dry run");
      }
      summary.stage = "submit-overlay-for-official-analysis";
      init = { ...init, body: brotliCompressSync(JSON.stringify(request)) };
    }
    if (pathname === "/api/deploy2/finish_push") {
      summary.stage = "reverify-production-baseline";
      if (!summary.schemaScopeVerified || !privateRead)
        throw Error("Cannot finish unverified deployment schema");
      if (stableJson(codeHashes()) !== stableJson(startupCodeHashes))
        throw Error("Deployment tool source changed during execution");
      const check = await realFetch(privateRead.url, privateRead.options);
      if (
        !check.ok ||
        baselineHash((await check.json()) as Baseline) !== baselineSha256
      )
        throw Error("Production deployment changed before finish");
      const currentSchemas = await realFetch(
        schemaReadRequest.url,
        schemaReadRequest.options,
      );
      const currentSchemaResult = (await currentSchemas.json()) as {
        status: string;
        value?: { active?: string; inProgress?: string };
      };
      if (
        !currentSchemas.ok ||
        currentSchemaResult.status !== "success" ||
        !currentSchemaResult.value?.active ||
        stableJson(JSON.parse(currentSchemaResult.value.active)) !==
          stableJson(schema) ||
        (currentSchemaResult.value.inProgress &&
          stableJson(JSON.parse(currentSchemaResult.value.inProgress)) !==
            stableJson(proposedSchema))
      )
        throw Error("Production schema changed before finish");
      summary.baselineReverified = true;
    }
    const response = await realFetch(input, init);
    if (pathname === "/api/deploy2/start_push" && response.ok) {
      summary.stage = "verify-analyzed-schema-scope";
      const checked = await response.clone().json();
      if (
        Object.keys(checked.app.childComponents).length !== 0 ||
        Object.keys(checked.analysis).some((key) => key !== "")
      )
        throw Error("Unexpected production component topology");
      if (schemaScope === "nightly-stats") {
        // Schema and index declarations contain no records or authenticated
        // transport details. Persist only this new table's public code contract.
        const tables = checked.analysis[""].schema?.tables ?? [];
        const playerFields =
          tables.find(
            (table: { tableName: string }) =>
              table.tableName === "playerNhlStatLines",
          )?.documentType?.value ?? {};
        summary.nightlySchemaAnalysis = {
          teamTable:
            tables.find(
              (table: { tableName: string }) =>
                table.tableName === "nhlTeamSeasonStatLines",
            ) ?? null,
          provenance: {
            nhlStatsSourceFetchedAt:
              playerFields.nhlStatsSourceFetchedAt ?? null,
            nhlStatsSourceSha256: playerFields.nhlStatsSourceSha256 ?? null,
          },
        };
      }
      assertDeploymentSchemaChange(
        schema,
        checked.analysis[""].schema,
        schemaScope,
      );
      proposedSchema = checked.analysis[""].schema;
      if (
        pendingSchema &&
        stableJson(pendingSchema) !== stableJson(proposedSchema)
      )
        throw Error(
          "Existing pending schema differs from reviewed proposed schema",
        );
      summary.schemaScopeVerified = true;
      assertDeploymentIndexChanges(
        schema,
        proposedSchema,
        checked.schemaChange.indexDiffs,
        schemaScope,
      );
    }
    if (pathname === "/api/deploy2/finish_push" && response.ok) {
      summary.finished = true;
      summary.stage = "finished";
    }
    return response;
  };
  globalThis.fetch = async (...args) => {
    try {
      return await intercept(...args);
    } catch (error) {
      if (error instanceof NodeDependencyProofError)
        summary.nodeProofFailure = error.evidence;
      const knownMessages = [
        "Apply requires reviewed plan",
        "Apply differs from reviewed successful dry run",
        "Unexpected deployment request fields",
        "Invalid or duplicate deployment module path",
        "Unresolved require alias prevents preservation proof",
        "External Node dependency prevents preservation proof",
        "Dynamic Node dependency prevents preservation proof",
        "createRequire prevents preservation proof",
        "Dynamic code prevents Node dependency preservation proof",
        "Unresolved Node dependency",
        "Missing explicit reviewed deployment entrypoint",
        "Deployment overlay target mismatch",
        "Production dependency metadata unavailable",
        "Active schema unavailable or concurrent schema in progress",
        "Missing verified production baseline",
        "Unexpected deployment mode or component changes",
        "Production source and hash inventories differ",
        "Production source/hash baseline changed during read",
        "Dependency path collides with preserved production code",
        "Unexpected entrypoint outside deployment allowlist",
        "Missing deployment dependency",
        "Reviewed schema requires optional hockeyOverall field",
        "Schema changes outside optional hockeyOverall are forbidden",
        "Dual ratings require unique existing NHL rating tables",
        "Dual ratings must preserve the nhlSeasonValues schema exactly",
        "Dual ratings require optional playerNhlStatLines.hockeyRating",
        "Schema changes outside optional hockeyRating are forbidden",
        "Nightly stats require unique canonical tables",
        "Nightly provenance requires exact optional nullable validators",
        "Nightly NHL team table must match the exact reviewed summary schema",
        "Duplicate NHL team season table",
        "Schema changes outside nightly NHL provenance and team summary are forbidden",
        "Index changes are outside reviewed deployment scope",
      ];
      summary.firstFailureStage ??= summary.stage;
      summary.failure ??=
        error instanceof Error && knownMessages.includes(error.message)
          ? error.message
          : "Operation failed; authenticated diagnostic details suppressed";
      // A failed scope/baseline check must never be retried as a normal push.
      process.exit(1);
    }
  };
  process.chdir(options.worktree);
  const cli = resolve(options.root, "node_modules/convex/bin/main.js");
  process.argv = [
    process.execPath,
    cli,
    "deploy",
    "--yes",
    ...(!options.apply ? ["--dry-run"] : []),
    "--typecheck",
    "disable",
    "--codegen",
    "disable",
    "--env-file",
    resolve(options.root, ".env.local"),
  ];
  await import(pathToFileURL(cli).href);
}
