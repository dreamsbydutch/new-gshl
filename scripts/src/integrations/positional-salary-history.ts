import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Authenticated CLI read, bounded and indexed. Never emits credentials or writes data. */
type Row = Record<string, unknown> & { id: string };
async function query<T>(code: string): Promise<T> {
  const root = resolve(import.meta.dirname, "../../.."),
    cli = resolve(root, "node_modules/convex/bin/main.js");
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-"], {
      cwd: root,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (data) => {
      stdout += String(data);
    });
    child.stderr.resume();
    child.on("error", () =>
      reject(new Error("Could not start positional history read")),
    );
    child.on("close", (exit) => {
      if (exit) reject(new Error("Read-only positional history query failed"));
      else
        try {
          accept(JSON.parse(stdout));
        } catch {
          reject(new Error("Invalid history JSON"));
        }
    });
    child.stdin.end(
      `process.argv=${JSON.stringify([process.execPath, cli, "run", "--deployment", "polished-tern-709", "--codegen", "disable", "--typecheck", "disable", "--inline-query", code])};await import(${JSON.stringify(pathToFileURL(cli).href)});`,
    );
  });
}
export function readPositionalDirectory() {
  return query<{ seasons: Row[]; players: Row[] }>(`
 const seasons=await ctx.db.query("seasons").take(101);
 const players=await ctx.db.query("players").take(5001);
 if(seasons.length===101||players.length===5001)throw new Error("Directory bound reached");
 return {seasons:seasons.map(r=>({...r,id:r._id})),players:players.map(r=>({id:r._id,nhlApiId:r.nhlApiId,fullName:r.fullName,posGroup:r.posGroup}))};
`);
}
export function readPositionalPage(
  table: "weeks" | "matchups" | "teamWeekStatLines" | "playerWeekStatLines",
  seasonId: string,
  cursor: string | null,
) {
  if (!/^[a-z0-9]+$/.test(seasonId))
    throw new Error("Invalid canonical season ID");
  return query<{ page: Row[]; isDone: boolean; continueCursor: string }>(
    `const page=await ctx.db.query(${JSON.stringify(table)}).withIndex("by_seasonId",q=>q.eq("seasonId",${JSON.stringify(seasonId)})).paginate({numItems:1000,cursor:${JSON.stringify(cursor)}});return {...page,page:page.page.map(r=>({...r,id:r._id}))};`,
  );
}
