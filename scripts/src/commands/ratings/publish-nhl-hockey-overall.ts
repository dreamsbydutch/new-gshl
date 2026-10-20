import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { loadHockeyOverallPublication } from "../../integrations/nhl/hockey-overall-publication";

const deployment = "polished-tern-709";
const root = fileURLToPath(new URL("../../../../", import.meta.url));
type Counts = {
  inserted: number;
  updated: number;
  unchanged: number;
  linked: number;
  unlinked: number[];
};
function validateCounts(value: Counts, length: number) {
  if (
    ![value.inserted, value.updated, value.unchanged, value.linked].every(
      (x) => Number.isInteger(x) && x >= 0,
    ) ||
    !Array.isArray(value.unlinked) ||
    value.inserted + value.updated + value.unchanged !== length ||
    value.linked + value.unlinked.length !== length ||
    value.updated !== 0
  )
    throw Error(
      "Unexpected import counts or updates; additive immutable rollout requires zero updates",
    );
}
/** Authenticated CLI credentials stay inside the CLI; public payload uses stdin. */
function convex(args: string[]): Promise<unknown> {
  return new Promise((accept, reject) => {
    const cli = resolve(root, "node_modules/convex/bin/main.js");
    const script = `process.argv=${JSON.stringify([process.execPath, cli, "run", "--deployment", deployment, "--codegen", "disable", "--typecheck", "disable", ...args])};await import(${JSON.stringify(pathToFileURL(cli).href)});`;
    const child = spawn(
      process.execPath,
      [
        ...(process.allowedNodeEnvironmentFlags.has("--use-system-ca")
          ? ["--use-system-ca"]
          : []),
        "--input-type=module",
        "-",
      ],
      { cwd: root, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on("data", () => {});
    child.on("error", () => reject(Error("Convex CLI could not start")));
    child.on("close", (code) => {
      if (code !== 0)
        return reject(
          Error("Convex CLI failed; authenticated diagnostics suppressed"),
        );
      try {
        accept(JSON.parse(stdout));
      } catch {
        reject(Error("Unexpected Convex response"));
      }
    });
    child.stdin.end(script);
  });
}
const { values } = parseArgs({
  options: {
    input: { type: "string" },
    output: { type: "string" },
    target: { type: "string" },
    deployment: { type: "string" },
    season: { type: "string" },
    apply: { type: "boolean", default: false },
    "local-only": { type: "boolean", default: false },
    help: { type: "boolean" },
  },
});
if (values.help)
  console.log(
    "Publish independently verified NHL hockey-overall rows, additive modelVersion nhl-hockey-overall-reviewed-v1. --target production --deployment polished-tern-709 --input <build summary.json> --output <NEW audit directory> [--season <NHL year>] [--local-only] [--apply]. Defaults to authenticated production dry run; local-only verifies without remote access. Replays every ready season's native shot inference and exact GB annual replacement math before import. Apply remotely preflights every ready batch before its first write and rejects updates. Writes only the new nhlSeasonValues model namespace, batches<=250, no deletions/replacement/legacy-finalization changes. Failed/unfinished nonfuture seasons exit nonzero; expected future pending seasons stay disclosed without failure. Other verified ready seasons may proceed.",
  );
else {
  if (
    values.target !== "production" ||
    values.deployment !== deployment ||
    !values.input ||
    !values.output ||
    (values.apply && values["local-only"])
  )
    throw Error(
      "Explicit --target production --deployment polished-tern-709, --input and --output required; local-only cannot apply",
    );
  const season =
    values.season === undefined ? undefined : Number(values.season);
  if (
    season !== undefined &&
    (!Number.isInteger(season) ||
      Math.floor(season / 10000) + 1 !== season % 10000)
  )
    throw Error("Invalid NHL season scope");
  const prepared = await loadHockeyOverallPublication(values.input, season);
  const output = resolve(values.output);
  await mkdir(output);
  const save = (file: string, value: unknown) =>
    writeFile(resolve(output, file), JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
    });
  await save("plan.json", {
    target: "production",
    deployment,
    table: "nhlSeasonValues",
    apply: values.apply,
    localOnly: values["local-only"],
    ...prepared,
  });
  if (!values["local-only"] && prepared.plans.length) {
    const ids = prepared.plans.map((p) => p.season.seasonId);
    const actual = (await convex([
      "--inline-query",
      `const ids=${JSON.stringify(ids)}; return await Promise.all(ids.map(async id=>{const s=await ctx.db.get(id);return s?{id:s._id,year:s.year,name:s.name}:null;}));`,
    ])) as Array<{ id: string; year: string | number; name: string } | null>;
    if (
      actual.length !== prepared.plans.length ||
      actual.some(
        (s, i) =>
          !s ||
          s.id !== ids[i] ||
          Number(`${Number(s.year) - 1}${s.year}`) !==
            prepared.plans[i].season.nhlSeason,
      )
    )
      throw Error(
        "Pinned deployment database-season identities differ from verified inventory",
      );
  }
  const outcomes = [];
  const remotePreflight = [];
  if (values.apply) {
    // Check every ready batch remotely before the first write, even on a direct apply.
    for (const plan of prepared.plans)
      for (let offset = 0; offset < plan.results.length; offset += 250) {
        const results = plan.results.slice(offset, offset + 250);
        const response = (await convex([
          "nhlSeasonValues:importBatch",
          JSON.stringify({ ...plan.metadata, results, apply: false }),
        ])) as Counts;
        validateCounts(response, results.length);
        remotePreflight.push({
          nhlSeason: plan.season.nhlSeason,
          offset,
          results: results.length,
          counts: response,
        });
      }
    await save("remote-preflight.json", remotePreflight);
  }
  if (!values["local-only"])
    for (const plan of prepared.plans) {
      const counts: Counts = {
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
        ])) as Counts;
        validateCounts(response, Math.min(250, plan.results.length - offset));
        for (const key of [
          "inserted",
          "updated",
          "unchanged",
          "linked",
        ] as const) {
          if (!Number.isInteger(response[key]) || response[key] < 0)
            throw Error("Invalid mutation counts");
          counts[key] += response[key];
        }
        if (!Array.isArray(response.unlinked))
          throw Error("Invalid unmatched identity response");
        counts.unlinked.push(...response.unlinked);
        await writeFile(
          resolve(output, `${plan.season.nhlSeason}.json`),
          JSON.stringify(
            {
              season: plan.season,
              processed: Math.min(offset + 250, plan.results.length),
              counts,
            },
            null,
            2,
          ) + "\n",
        );
      }
      outcomes.push({
        nhlSeason: plan.season.nhlSeason,
        rows: plan.results.length,
        counts,
      });
      console.log(
        JSON.stringify({
          mode: values.apply ? "apply" : "dry-run",
          nhlSeason: plan.season.nhlSeason,
          counts,
        }),
      );
    }
  const unfinished = [...prepared.excluded, ...prepared.pending];
  const futurePendingSeasons = unfinished.filter(
    (entry) => entry.state === "future",
  ).length;
  const unfinishedNonfutureSeasons = unfinished.length - futurePendingSeasons;
  await save("summary.json", {
    deployment,
    modelVersion: "nhl-hockey-overall-reviewed-v1",
    apply: values.apply,
    localOnly: values["local-only"],
    readySeasons: prepared.plans.length,
    outcomes,
    unfinished,
    futurePendingSeasons,
    unfinishedNonfutureSeasons,
    verifiedInputSummaryHash: prepared.summaryHash,
  });
  if (unfinishedNonfutureSeasons) process.exitCode = 1;
  console.log(
    JSON.stringify({
      output,
      verifiedSeasons: prepared.plans.length,
      unfinishedSeasons: unfinished.length,
      futurePendingSeasons,
      unfinishedNonfutureSeasons,
      remote: !values["local-only"],
    }),
  );
}
