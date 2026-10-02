import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  planYahooSyncCycle,
  type YahooSyncCheckpoint,
} from "../../domains/yahoo/sync-cycle";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const HELP = `Run one scheduled Yahoo cycle (dry run by default).
  --deployment NAME      Explicit production Convex deployment.
  --league-id ID         Current Yahoo league.
  --season-id ID         GSHL season, canonical or legacy.
  --start-date DATE      First scoring day (YYYY-MM-DD).
  --end-date DATE        Last scoring day (YYYY-MM-DD).
  --python-bin PATH      Python with scripts/python/requirements.txt installed.
  --state-dir PATH       Local checkpoint/log directory (default .local-data/yahoo-sync).
  --apply               Run imports, current rosters and safe aggregate updates.
  --help                Show this help without authentication or live reads.

Schedule this command every 15 minutes. Current rosters refresh every cycle;
NHL stats refresh hourly. After 06:00 Toronto, recheck the previous two days.
Offline gaps catch up two historical dates per cycle. Failed stages retry.
Credentials stay in memory: CONVEX_SERVER_SECRET or the signed-in Convex CLI.
`;

function main() {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean" },
      apply: { type: "boolean" },
      deployment: { type: "string" },
      "league-id": { type: "string" },
      "season-id": { type: "string" },
      "start-date": { type: "string" },
      "end-date": { type: "string" },
      "python-bin": { type: "string" },
      "state-dir": { type: "string" },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  const deployment = values.deployment ?? "";
  const leagueId = values["league-id"] ?? "";
  const seasonId = values["season-id"] ?? "";
  const startDate = values["start-date"] ?? "";
  const endDate = values["end-date"] ?? "";
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(deployment) ||
    !/^\d+$/.test(leagueId) ||
    !/^[a-zA-Z0-9]+$/.test(seasonId)
  )
    throw new Error(
      "Explicit deployment, numeric league ID and season ID are required.",
    );
  for (const date of [startDate, endDate])
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      throw new Error("Valid season start/end dates are required.");
  if (startDate > endDate) throw new Error("Season date range is reversed.");
  const directory = path.resolve(
    root,
    values["state-dir"] ?? ".local-data/yahoo-sync",
  );
  fs.mkdirSync(directory, { recursive: true });
  const scope = `${deployment}-${leagueId}-${seasonId}`;
  const statePath = path.join(directory, `${scope}.json`);
  const lockPath = path.join(directory, `${scope}.lock`);
  const scopeKey = `${scope}:${startDate}:${endDate}`;
  let checkpoint: YahooSyncCheckpoint = {};
  if (fs.existsSync(statePath)) {
    const stored = JSON.parse(
      fs.readFileSync(statePath, "utf8"),
    ) as YahooSyncCheckpoint & { scopeKey: string };
    if (stored.scopeKey !== scopeKey)
      throw new Error(
        "Checkpoint scope differs; use a separate state directory.",
      );
    checkpoint = stored;
  }
  // A process-owned lock survives scheduled/manual overlap and recovers after a crash.
  if (fs.existsSync(lockPath)) {
    let pid: number;
    try {
      pid = Number(fs.readFileSync(lockPath, "utf8"));
    } catch {
      throw new Error("Unable to inspect Yahoo sync lock.");
    }
    if (!Number.isSafeInteger(pid) || pid <= 0)
      throw new Error("Yahoo sync lock is invalid; inspect the previous run.");
    try {
      process.kill(pid, 0);
      console.log("Another Yahoo cycle is running; skipped.");
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      fs.unlinkSync(lockPath);
    }
  }
  let lock: number;
  try {
    lock = fs.openSync(lockPath, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      console.log("Another Yahoo cycle acquired the lock; skipped.");
      return;
    }
    throw error;
  }
  fs.writeFileSync(lock, String(process.pid));
  const now = new Date();
  const plan = planYahooSyncCycle({ now, startDate, endDate, checkpoint });
  const logPath = path.join(directory, `${scope}-${plan.today}.log`);
  const statusPath = path.join(
    directory,
    `${scope}-${values.apply ? "status" : "preview-status"}.json`,
  );
  let secret = "";
  const log = (message: string) => {
    const safe = secret ? message.split(secret).join("[redacted]") : message;
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${safe}\n`);
    console.log(safe);
  };
  const save = () => {
    const temporary = `${statePath}.${process.pid}.tmp`;
    fs.writeFileSync(
      temporary,
      JSON.stringify({ scopeKey, ...checkpoint }, null, 2),
    );
    fs.renameSync(temporary, statePath);
  };
  try {
    log(
      JSON.stringify({
        deployment,
        leagueId,
        seasonId,
        apply: !!values.apply,
        ...plan,
      }),
    );
    if (!plan.active && !plan.historyDates.length) {
      log("Outside scoring/catch-up dates; no work due.");
      return;
    }
    secret = process.env.CONVEX_SERVER_SECRET?.trim() ?? "";
    if (!secret) {
      const auth = spawnSync(
        process.execPath,
        [
          "--use-system-ca",
          path.join(root, "node_modules/convex/bin/main.js"),
          "env",
          "get",
          "CONVEX_SERVER_SECRET",
          "--deployment",
          deployment,
        ],
        {
          cwd: root,
          encoding: "utf8",
          timeout: 120_000,
          windowsHide: true,
        },
      );
      if (auth.status !== 0)
        throw new Error(
          "Convex CLI authentication failed; sign in on the operator PC.",
        );
      secret = (auth.stdout ?? "").trim();
    }
    if (!secret || /[\r\n]/.test(secret))
      throw new Error("Production server credential is unavailable.");
    const run = (date: string, flags: string[]) => {
      log(`Starting ${date}: ${flags.join(" ")}`);
      const child = spawnSync(
        process.execPath,
        [
          "--use-system-ca",
          path.join(root, "node_modules/tsx/dist/cli.mjs"),
          path.join(
            root,
            "scripts/src/commands/stats/sync-yahoo-daily-rosters.ts",
          ),
          "--target",
          "production",
          "--season-id",
          seasonId,
          "--league-id",
          leagueId,
          "--date",
          date,
          "--summary",
          "--python-bin",
          values["python-bin"] ?? "python",
          ...flags,
          ...(values.apply ? ["--apply"] : []),
        ],
        {
          cwd: path.join(root, "scripts"),
          encoding: "utf8",
          timeout: 20 * 60 * 1000,
          maxBuffer: 8 * 1024 * 1024,
          windowsHide: true,
          env: {
            ...process.env,
            GSHL_CONVEX_TARGET: "production",
            CONVEX_PROD_URL: `https://${deployment}.convex.cloud`,
            CONVEX_SERVER_SECRET: secret,
          },
        },
      );
      if (child.stdout) log(child.stdout);
      if (child.stderr) log(child.stderr);
      if (child.status !== 0)
        throw new Error(
          `Yahoo stage ${date} failed (${child.error?.message ?? child.status ?? "unknown"}); checkpoint was not advanced for this stage.`,
        );
    };
    const failures: string[] = [];
    if (plan.active) {
      try {
        run(
          plan.today,
          plan.refreshNhl
            ? ["--daily-pipeline"]
            : ["--current-rosters", "--aggregate"],
        );
        if (values.apply && plan.refreshNhl) {
          checkpoint.lastNhlSyncAt = Date.now();
          save();
        }
      } catch (error) {
        failures.push(
          error instanceof Error
            ? error.message
            : "Current roster stage failed.",
        );
      }
    }
    const completed = new Set<string>();
    for (const date of plan.historyDates) {
      try {
        run(date, ["--sync-nhl", "--aggregate"]);
        completed.add(date);
        if (values.apply) {
          checkpoint.reconciledThrough = [
            checkpoint.reconciledThrough ?? startDate,
            date,
          ]
            .sort()
            .at(-1)!;
          save();
        }
      } catch (error) {
        failures.push(
          error instanceof Error ? error.message : "Historical stage failed.",
        );
        break; // Never advance the checkpoint past a failed historical date.
      }
    }
    if (
      values.apply &&
      plan.morning &&
      plan.recent.length &&
      plan.recent.every((date) => completed.has(date))
    ) {
      checkpoint.morningRecheckOn = plan.today;
      save();
    }
    if (failures.length) throw new Error(failures.join("\n"));
    fs.writeFileSync(
      statusPath,
      JSON.stringify(
        {
          scopeKey,
          status: values.apply ? "success" : "dry-run",
          finishedAt: new Date().toISOString(),
          plan,
        },
        null,
        2,
      ),
    );
    log("Yahoo cycle completed.");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Yahoo cycle failed.";
    log(message);
    fs.writeFileSync(
      statusPath,
      JSON.stringify(
        {
          scopeKey,
          status: "failed",
          finishedAt: new Date().toISOString(),
          message: secret ? message.split(secret).join("[redacted]") : message,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Yahoo cycle failed.");
  process.exitCode = 1;
}
