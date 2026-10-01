import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { prepareGameValuePublication } from "../../domains/nhl/game-value-publication";
import {
  NHL_SEASON_RATING_CONFIG,
  rankNhlSeason,
  type NhlSeasonRating,
} from "../../runtime/nhl-season-rating";
import {
  buildNhlRatingInput,
  type NhlRatingSource,
} from "../../domains/nhl/season-rating-input";

type Season = { id: string; name: string; nhlSeason: number; status: string };
type Result = {
  inserted: number;
  updated: number;
  unchanged: number;
  linked: number;
  unlinked: number[];
};
const { values } = parseArgs({
  options: {
    input: { type: "string" },
    output: { type: "string" },
    target: { type: "string" },
    season: { type: "string" },
    model: { type: "string", default: "v1" },
    baseline: { type: "string" },
    "provisional-reason": { type: "string" },
    apply: { type: "boolean", default: false },
    help: { type: "boolean" },
  },
});
const root = fileURLToPath(new URL("../../../../", import.meta.url));

/** The CLI owns admin authentication; credentials never enter argv, logs or artifacts. */
function convex(args: string[]): Promise<unknown> {
  return new Promise((accept, reject) => {
    const cli = resolve(root, "node_modules/convex/bin/main.js");
    // Pass public result payloads through stdin to avoid Windows command-line limits.
    const script = `process.argv=${JSON.stringify([process.execPath, cli, "run", "--prod", "--codegen", "disable", "--typecheck", "disable", ...args])}; await import(${JSON.stringify(pathToFileURL(cli).href)});`;
    const child = spawn(process.execPath, ["--input-type=module", "-"], {
      cwd: root,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0)
        return reject(new Error(`Convex command failed: ${stderr}`));
      try {
        accept(JSON.parse(stdout));
      } catch {
        reject(new Error("Unexpected Convex response"));
      }
    });
    child.stdin.end(script);
  });
}

if (values.help) {
  console.log(`Import independent NHL ratings into nhlSeasonValues. Defaults to dry run.
  --target production     Required explicit target; uses authenticated Convex CLI
  --input <directory>     Verified multi-season report directory with summary.json
  --output <directory>    Required new directory for the audit and per-season journal
  --season 20242025       Optional single NHL season scope
  --model v1|v3          Defaults to v1; v3 requires complete verified game reports
  --baseline <directory> Required v2 source/calibration root for v3
  --provisional-reason <review> Explicit single-season v3 publication as provisional;
                         retains failed review checks, withholds ranks/percentiles.
                         Requires complete reconciled inputs, >=95% process and
                         >=98% shot coverage; only process/impact accuracy may fail.
  --apply                 Persist the reviewed records; never deletes data
Writes only nhlSeasonValues. Existing GSHL ratings, stats and salaries are untouched.
Requires the nhlSeasonValues schema and internal importBatch mutation deployed.`);
} else {
  if (values.target !== "production" || !values.input || !values.output)
    throw new Error("--target production, --input and --output are required");
  if (
    !["v1", "v3"].includes(values.model!) ||
    (values.model === "v3" && !values.baseline)
  )
    throw new Error("Invalid model or missing v3 baseline");
  if (
    values["provisional-reason"] !== undefined &&
    (values.model !== "v3" || !values.season)
  )
    throw new Error(
      "Provisional publication requires an explicit single v3 season",
    );
  const inputDirectory = resolve(values.input),
    outputDirectory = resolve(values.output);
  await mkdir(outputDirectory, { recursive: true });
  const summary = JSON.parse(
    await readFile(resolve(inputDirectory, "summary.json"), "utf8"),
  ) as { seasons: Season[]; pending?: unknown[] };
  if (!values.season && summary.pending?.length)
    throw new Error(
      "Unfinished season rebuilds; publish an explicit completed season or finish the rebuild",
    );
  const seasons = summary.seasons.filter(
    (s) => !values.season || String(s.nhlSeason) === values.season,
  );
  if (!seasons.length || seasons.some((s) => s.status !== "complete"))
    throw new Error("Missing or incomplete season reports");
  const plans = [];
  // Verify every local season before the first production write.
  for (const season of seasons) {
    const directory = resolve(inputDirectory, String(season.nhlSeason));
    if (values.model === "v3") {
      const baseline = resolve(values.baseline!, String(season.nhlSeason));
      const [sourceText, priorText, reportText, auditText] = await Promise.all([
        readFile(resolve(baseline, "source.json"), "utf8"),
        readFile(resolve(baseline, "ratings.json"), "utf8"),
        readFile(resolve(directory, "ratings.json"), "utf8"),
        readFile(resolve(directory, "game-audit.json"), "utf8"),
      ]);
      const prepared = prepareGameValuePublication({
        season: season.nhlSeason,
        sourceText,
        priorText,
        reportText,
        auditText,
        provisionalReason: values["provisional-reason"],
      });
      plans.push({
        season,
        metadata: { seasonId: season.id, ...prepared.metadata },
        results: prepared.results,
      });
      console.log(`Verified local v3 snapshot ${season.name}`);
      continue;
    }
    const sourceText = await readFile(
      resolve(directory, "source.json"),
      "utf8",
    );
    const source = JSON.parse(sourceText) as NhlRatingSource;
    const report = JSON.parse(
      await readFile(resolve(directory, "ratings.json"), "utf8"),
    ) as {
      version: string;
      config: unknown;
      season: number;
      profile: string;
      gameType: number;
      ratings: NhlSeasonRating[];
    };
    if (
      source.season !== season.nhlSeason ||
      report.season !== season.nhlSeason ||
      source.gameType !== 2 ||
      source.profile !== "core" ||
      report.profile !== source.profile ||
      report.gameType !== source.gameType ||
      report.version !== NHL_SEASON_RATING_CONFIG.version ||
      JSON.stringify(report.config) !==
        JSON.stringify(NHL_SEASON_RATING_CONFIG) ||
      JSON.stringify(report.ratings) !==
        JSON.stringify(rankNhlSeason(buildNhlRatingInput(source)))
    )
      throw new Error(`Unverified source/results for ${season.name}`);
    plans.push({
      season,
      metadata: {
        seasonId: season.id,
        nhlSeason: season.nhlSeason,
        gameType: source.gameType,
        profile: source.profile,
        modelVersion: report.version,
        sourceFetchedAt: Date.parse(source.fetchedAt),
        sourceHash: createHash("sha256").update(sourceText).digest("hex"),
      },
      results: report.ratings.map(
        ({ playerId, components: _components, ...result }) => ({
          nhlPlayerId: playerId,
          ...result,
        }),
      ),
    });
    console.log(`Verified local snapshot ${season.name}`);
  }
  await writeFile(
    resolve(outputDirectory, "plan.json"),
    JSON.stringify(
      {
        target: "production",
        table: "nhlSeasonValues",
        apply: values.apply,
        provisionalReason: values["provisional-reason"],
        plans,
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  const outcomes: Array<{ season: string; results: number; counts: Result }> =
    [];
  const queue = [...plans];
  async function worker() {
    while (queue.length) {
      const plan = queue.shift()!;
      const counts: Result = {
        inserted: 0,
        updated: 0,
        unchanged: 0,
        linked: 0,
        unlinked: [],
      };
      for (let offset = 0; offset < plan.results.length; offset += 250) {
        const response = (await convex([
          "nhlSeasonValues:importBatch",
          JSON.stringify({
            ...plan.metadata,
            results: plan.results.slice(offset, offset + 250),
            apply: values.apply,
          }),
        ])) as Result;
        for (const key of [
          "inserted",
          "updated",
          "unchanged",
          "linked",
        ] as const)
          counts[key] += response[key];
        counts.unlinked.push(...response.unlinked);
        await writeFile(
          resolve(outputDirectory, `${plan.season.nhlSeason}.json`),
          JSON.stringify(
            {
              season: plan.season,
              processed: Math.min(offset + 250, plan.results.length),
              counts,
            },
            null,
            2,
          ),
        );
      }
      outcomes.push({
        season: plan.season.name,
        results: plan.results.length,
        counts,
      });
      console.log(
        `${values.apply ? "Applied" : "Dry run"} ${plan.season.name}: ${JSON.stringify(counts)}`,
      );
    }
  }
  await Promise.all([worker(), worker()]);
  outcomes.sort((a, b) => a.season.localeCompare(b.season));
  await writeFile(
    resolve(outputDirectory, "summary.json"),
    JSON.stringify(
      {
        target: "production",
        table: "nhlSeasonValues",
        apply: values.apply,
        completedAt: Date.now(),
        outcomes,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      seasons: outcomes.length,
      inserted: outcomes.reduce((s, x) => s + x.counts.inserted, 0),
      updated: outcomes.reduce((s, x) => s + x.counts.updated, 0),
      unchanged: outcomes.reduce((s, x) => s + x.counts.unchanged, 0),
      linked: outcomes.reduce((s, x) => s + x.counts.linked, 0),
      unlinked: outcomes.reduce((s, x) => s + x.counts.unlinked.length, 0),
    }),
  );
}
