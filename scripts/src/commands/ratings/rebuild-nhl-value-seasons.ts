import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { prepareGameValuePublication } from "../../domains/nhl/game-value-publication";

const { values } = parseArgs({
  options: {
    baseline: { type: "string" },
    cache: { type: "string" },
    output: { type: "string" },
    season: { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help) {
  console.log(
    "Rebuild all tracked NHL regular seasons locally. --baseline <v2 root> --cache <public cache> --output <resumable directory> [--season 20242025]. Collects throttled public data, audits and repairs official shifts, fits each season, and validates publication artifacts. Resumes completed verified seasons. No database writes. Failures remain explicit in summary.json.",
  );
} else {
  if (!values.baseline || !values.cache || !values.output)
    throw new Error("Missing paths");
  const baseline = resolve(values.baseline),
    cache = resolve(values.cache),
    output = resolve(values.output);
  await mkdir(output, { recursive: true });
  const sourceSummary = JSON.parse(
    await readFile(resolve(baseline, "summary.json"), "utf8"),
  ) as {
    seasons: Array<{
      id: string;
      name: string;
      nhlSeason: number;
      status: string;
    }>;
  };
  const seasons = sourceSummary.seasons.filter(
    (s) => !values.season || String(s.nhlSeason) === values.season,
  );
  if (
    !seasons.length ||
    seasons.some((s) => s.status !== "complete") ||
    new Set(seasons.map((s) => s.nhlSeason)).size !== seasons.length
  )
    throw new Error("Invalid baseline scope");
  let outcomes: Array<Record<string, unknown>> = [];
  try {
    const previous = JSON.parse(
      await readFile(resolve(output, "summary.json"), "utf8"),
    ) as { seasons: Array<Record<string, unknown>> };
    outcomes = previous.seasons.filter(
      (s) => !seasons.some((selected) => selected.nhlSeason === s.nhlSeason),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
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
  for (const season of seasons) {
    const directory = resolve(output, String(season.nhlSeason));
    const attempt = resolve(output, `${season.nhlSeason}-${Date.now()}`);
    try {
      let complete = false;
      try {
        await access(resolve(directory, "ratings.json"));
        complete = true;
      } catch {}
      if (!complete) {
        const common = ["--season", String(season.nhlSeason), "--cache", cache];
        console.log(`Collecting ${season.name}`);
        await run(
          "collect-nhl-value-games.ts",
          [...common, "--output", attempt + "-collect.json"],
          attempt + "-collect.log",
        );
        const preview = [...common, "--baseline", baseline];
        await run(
          "preview-nhl-value-v3.ts",
          [...preview, "--output", attempt + "-prepare", "--prepare-only"],
          attempt + "-prepare.log",
        );
        await run(
          "collect-nhl-value-games.ts",
          [
            ...common,
            "--repair-audit",
            resolve(attempt + "-prepare", "game-audit.json"),
            "--output",
            attempt + "-repair.json",
          ],
          attempt + "-repair.log",
        );
        // A failed fit may leave an audit behind; use a new attempt directory and
        // retain it for review rather than overwriting earlier evidence.
        const fitted = attempt + "-fitted";
        await run(
          "preview-nhl-value-v3.ts",
          [...preview, "--output", fitted],
          attempt + "-fit.log",
        );
        await mkdir(directory, { recursive: true });
        for (const file of ["ratings.json", "ratings.csv", "game-audit.json"])
          await writeFile(
            resolve(directory, file),
            await readFile(resolve(fitted, file)),
            { flag: "wx" },
          );
      }
      const [sourceText, priorText, reportText, auditText] = await Promise.all([
        readFile(
          resolve(baseline, String(season.nhlSeason), "source.json"),
          "utf8",
        ),
        readFile(
          resolve(baseline, String(season.nhlSeason), "ratings.json"),
          "utf8",
        ),
        readFile(resolve(directory, "ratings.json"), "utf8"),
        readFile(resolve(directory, "game-audit.json"), "utf8"),
      ]);
      const prepared = prepareGameValuePublication({
        season: season.nhlSeason,
        sourceText,
        priorText,
        reportText,
        auditText,
      });
      outcomes.push({
        ...season,
        status: "complete",
        count: prepared.results.length,
        sourceHash: prepared.metadata.sourceHash,
      });
      console.log(
        `Verified ${season.name}: ${prepared.results.length} player seasons`,
      );
    } catch (error) {
      outcomes.push({
        ...season,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await writeFile(
      resolve(output, "summary.json"),
      JSON.stringify(
        {
          version: "nhl-season-value-v3",
          seasons: outcomes,
          pending: sourceSummary.seasons.filter(
            (s) => !outcomes.some((o) => o.nhlSeason === s.nhlSeason),
          ),
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }
  if (
    outcomes.some(
      (s) =>
        seasons.some((selected) => selected.nhlSeason === s.nhlSeason) &&
        s.status !== "complete",
    )
  )
    process.exitCode = 1;
}
