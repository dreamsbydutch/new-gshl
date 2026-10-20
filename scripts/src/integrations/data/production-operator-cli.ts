import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const deployment = "polished-tern-709";
/** Capture authenticated CLI output privately; diagnostics never reach logs. */
export async function capturedCli(args: string[]): Promise<string> {
  const cli = resolve(root, "node_modules/convex/bin/main.js");
  return new Promise((accept, reject) => {
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
      reject(Error("Production operator CLI could not start")),
    );
    child.on("close", (code) =>
      code === 0
        ? accept(output)
        : reject(
            Error(
              "Production operator CLI failed; authenticated diagnostics suppressed",
            ),
          ),
    );
    child.stdin.end(
      `process.argv=${JSON.stringify([process.execPath, cli, ...args])};await import(${JSON.stringify(pathToFileURL(cli).href)});`,
    );
  });
}
export async function readProductionOperatorQuery(
  expression: string,
): Promise<unknown> {
  return JSON.parse(
    await capturedCli([
      "run",
      "--deployment",
      deployment,
      "--codegen",
      "disable",
      "--typecheck",
      "disable",
      "--inline-query",
      expression,
    ]),
  );
}
/** The credential and mutation arguments travel through child stdin, never argv/logs. */
export async function createProductionOperatorWriter() {
  const secret = (
    await capturedCli([
      "env",
      "get",
      "CONVEX_SERVER_SECRET",
      "--deployment",
      deployment,
    ])
  ).trim();
  if (!secret || /[\r\n]/.test(secret))
    throw Error("Production server credential unavailable");
  return async (
    name: "data:updateById" | "data:insertMany",
    args: Record<string, unknown>,
  ): Promise<unknown> => {
    return JSON.parse(
      await capturedCli([
        "run",
        "--deployment",
        deployment,
        "--codegen",
        "disable",
        "--typecheck",
        "disable",
        name,
        JSON.stringify({ ...args, serverSecret: secret }),
      ]),
    );
  };
}

/** Bounded indexed aggregate batches; credentials stay inside this closure. */
export async function createProductionAggregateWriter() {
  const secret = (
    await capturedCli([
      "env",
      "get",
      "CONVEX_SERVER_SECRET",
      "--deployment",
      deployment,
    ])
  ).trim();
  if (!secret || /[\r\n]/.test(secret))
    throw Error("Production server credential unavailable");
  const client = new ConvexHttpClient(`https://${deployment}.convex.cloud`);
  const ref = makeFunctionReference<"mutation">(
    "maintenanceScope:upsertAggregateRows",
  );
  return async (table: string, rows: Record<string, unknown>[]) => {
    if (
      !new Set([
        "playerWeekStatLines",
        "playerSplitStatLines",
        "playerTotalStatLines",
        "teamDayStatLines",
        "teamWeekStatLines",
        "teamSeasonStatLines",
      ]).has(table) ||
      rows.length > 25
    )
      throw Error("Unsupported aggregate scope");
    try {
      const result = await client.mutation(ref, {
        serverSecret: secret,
        table,
        rows,
      });
      if (result.updated + result.inserted !== rows.length)
        throw Error("Aggregate mutation count mismatch");
      return result;
    } catch {
      throw Error(
        `Production aggregate batch failed for ${table}; private diagnostics suppressed`,
      );
    }
  };
}
