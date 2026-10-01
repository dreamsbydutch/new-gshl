import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    target: { type: "string" },
    baseline: { type: "string" },
    cache: { type: "string" },
    output: { type: "string" },
    season: { type: "string" },
    apply: { type: "boolean" },
    help: { type: "boolean" },
  },
});
if (values.help) {
  console.log(
    "Resumable NHL v3 production rollout. --target production --baseline <v2 root> --cache <public cache> --output <rollout root> [--season 20242025] [--apply]. Rebuilds and verifies each season, dry-runs imports, applies only additive/idempotent plans when requested, then requires an all-unchanged verification. Failed seasons remain in rollout.json and do not prevent independent seasons. No deletions, no replacement of source snapshots, no recurring schedule. Uses authenticated Convex production CLI; deploy v3 support first.",
  );
} else {
  if (
    values.target !== "production" ||
    !values.baseline ||
    !values.cache ||
    !values.output
  )
    throw new Error("Explicit production target and all paths required");
  const baseline = resolve(values.baseline),
    cache = resolve(values.cache),
    output = resolve(values.output);
  await mkdir(output, { recursive: true });
  const summary = JSON.parse(
    await readFile(resolve(baseline, "summary.json"), "utf8"),
  ) as {
    seasons: Array<{
      id: string;
      name: string;
      nhlSeason: number;
      status: string;
    }>;
  };
  const seasons = summary.seasons
    .filter((s) => !values.season || String(s.nhlSeason) === values.season)
    .sort(
      (a, b) =>
        Number(b.nhlSeason === 20242025) - Number(a.nhlSeason === 20242025) ||
        a.nhlSeason - b.nhlSeason,
    );
  if (!seasons.length || seasons.some((s) => s.status !== "complete"))
    throw new Error("Incomplete baseline scope");
  const outcomes: Array<Record<string, unknown>> = [];
  async function run(command: string, args: string[], log: string) {
    let transcript = "";
    const code = await new Promise<number | null>((accept, reject) => {
      const child = spawn(
        process.execPath,
        [
          resolve("node_modules/tsx/dist/cli.mjs"),
          resolve("scripts/src/commands/ratings", command),
          ...args,
        ],
        {
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      child.stdout.on("data", (data: Buffer) => {
        transcript += data;
        process.stdout.write(data);
      });
      child.stderr.on("data", (data: Buffer) => {
        transcript += data;
        process.stderr.write(data);
      });
      child.on("error", reject);
      child.on("close", accept);
    });
    await writeFile(log, transcript, { flag: "wx" });
    if (code !== 0) throw new Error(`${command} failed (${code}); see ${log}`);
  }
  async function persist(activeSeason: number | null) {
    await writeFile(
      resolve(output, "rollout.json"),
      JSON.stringify(
        {
          target: "production",
          apply: Boolean(values.apply),
          activeSeason,
          outcomes,
          pending: seasons.filter(
            (s) => !outcomes.some((o) => o.nhlSeason === s.nhlSeason),
          ),
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }
  for (const season of seasons) {
    await persist(season.nhlSeason);
    const attempt = resolve(
      output,
      `${season.nhlSeason}-publish-${Date.now()}`,
    );
    try {
      const input = resolve(output, "seasons");
      await run(
        "rebuild-nhl-value-seasons.ts",
        [
          "--baseline",
          baseline,
          "--cache",
          cache,
          "--output",
          input,
          "--season",
          String(season.nhlSeason),
        ],
        attempt + "-rebuild.log",
      );
      const args = [
        "--target",
        "production",
        "--model",
        "v3",
        "--baseline",
        baseline,
        "--input",
        input,
        "--season",
        String(season.nhlSeason),
      ];
      async function publish(stage: string, apply: boolean) {
        const directory = attempt + "-" + stage;
        await run(
          "publish-nhl-season-values.ts",
          [...args, "--output", directory, ...(apply ? ["--apply"] : [])],
          directory + ".log",
        );
        const report = JSON.parse(
          await readFile(resolve(directory, "summary.json"), "utf8"),
        ) as {
          outcomes: Array<{
            results: number;
            counts: {
              inserted: number;
              updated: number;
              unchanged: number;
              linked: number;
              unlinked: number[];
            };
          }>;
        };
        if (report.outcomes.length !== 1)
          throw new Error("Unexpected publication scope");
        const row = report.outcomes[0]!;
        if (
          row.results <= 0 ||
          row.counts.updated !== 0 ||
          row.counts.inserted + row.counts.unchanged !== row.results ||
          row.counts.linked + row.counts.unlinked.length !== row.results ||
          (stage === "verify" && row.counts.unchanged !== row.results)
        )
          throw new Error("Unexpected production publication delta");
        return row;
      }
      const plan = await publish("dry-run", false);
      console.log(
        `Reviewed additive plan ${season.name}: ${JSON.stringify(plan)}`,
      );
      if (values.apply) {
        await publish("apply", true);
        const verified = await publish("verify", false);
        if (
          verified.results !== plan.results ||
          verified.counts.linked !== plan.counts.linked ||
          JSON.stringify(verified.counts.unlinked) !==
            JSON.stringify(plan.counts.unlinked)
        )
          throw new Error("Production identity links changed during rollout");
      }
      outcomes.push({
        ...season,
        status: values.apply ? "published-and-verified" : "dry-run",
        count: plan.results,
        unlinked: plan.counts.unlinked,
        journal: attempt,
      });
    } catch (error) {
      outcomes.push({
        ...season,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(`Failed ${season.name}; retained audit artifacts`);
    }
    await persist(null);
  }
  if (outcomes.some((s) => s.status === "failed")) process.exitCode = 1;
}
