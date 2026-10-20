import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
export const dualRatingDeployment = "polished-tern-709";

/** Credentials and authenticated diagnostics remain inside the CLI child. */
export function runDualRatingConvex(args: string[]): Promise<unknown> {
  return new Promise((accept, reject) => {
    const cli = resolve(root, "node_modules/convex/bin/main.js");
    const child = spawn(
      process.execPath,
      ["--use-system-ca", "--input-type=module", "-"],
      {
        cwd: root,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (data: Buffer) => {
      output += data.toString();
    });
    child.stderr.resume();
    child.on("error", () =>
      reject(Error("Production rating operation could not start")),
    );
    child.on("close", (code) => {
      if (code !== 0)
        return reject(
          Error(
            "Production rating operation failed; authenticated diagnostics suppressed",
          ),
        );
      try {
        accept(JSON.parse(output));
      } catch {
        reject(Error("Invalid production rating response"));
      }
    });
    child.stdin.end(
      `process.argv=${JSON.stringify([process.execPath, cli, "run", "--deployment", dualRatingDeployment, "--codegen", "disable", "--typecheck", "disable", ...args])};await import(${JSON.stringify(pathToFileURL(cli).href)});`,
    );
  });
}

export type DualRatingRow = Record<string, unknown> & {
  _id: string;
  seasonId: string;
  playerId: string;
};
export type DualRatingSeason = {
  season: Record<string, unknown> & { _id: string };
  stats: DualRatingRow[];
};
export async function readDualRatingSeasons(): Promise<DualRatingSeason[]> {
  const seasons = (await runDualRatingConvex([
    "--inline-query",
    'const rows=await ctx.db.query("seasons").take(101);if(rows.length===101)throw Error("Season bound reached");return rows;',
  ])) as DualRatingSeason["season"][];
  const result: DualRatingSeason[] = [];
  for (const season of seasons) {
    const stats = (await runDualRatingConvex([
      "--inline-query",
      `const rows=await ctx.db.query("playerNhlStatLines").withIndex("by_seasonId",q=>q.eq("seasonId",${JSON.stringify(season._id)})).take(2001);if(rows.length===2001)throw Error("Season row bound reached");return rows;`,
    ])) as DualRatingRow[];
    result.push({ season, stats });
  }
  return result;
}
