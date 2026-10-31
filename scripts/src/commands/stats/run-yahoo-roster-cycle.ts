import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  planYahooSyncCycle,
  type YahooSyncCheckpoint,
} from "../../domains/yahoo/sync-cycle";
import { fetchDailyGameStatus } from "../../integrations/nhl/daily-game-status";
import { allScoringGamesFinished } from "../../domains/yahoo/weekly-rollover";

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
  --nhl-end-date DATE    Last NHL season day; nightly NHL refresh can outlast GSHL playoffs.
  --python-bin PATH      Python with scripts/python/requirements.txt installed.
  --superseded-backup-dir PATH  Recovery backup outside workspace/OneDrive for superseded-day deletion.
  --state-dir PATH       Local checkpoint/log directory (default .local-data/yahoo-sync).
  --skip-weekly-rollover  Refresh stats without publishing weekly editions/standings/power.
  --apply               Run imports, current rosters and safe aggregate updates.
  --help                Show this help without authentication or live reads.

Schedule every five minutes. NHL stats run hourly, or every five minutes while an
official regular-season/playoff game is LIVE/CRIT (including after midnight).
Yahoo runs hourly between 08:00 and 22:00 Toronto. One final capture after
all games start locks that date; later NHL updates use stored rosters.
NHL-only updates continue through 03:00, using the previous date after midnight.
Between midnight and 08:00, yesterday's full season/career/NHL refresh runs once
all its games are final. Unknown or unfinished schedules defer this stage.
Morning runs recheck the previous two days.
Hourly NHL runs recheck all prior days of unfinalized matchups for corrections.
Finalized weeks are frozen; their roster and NHL records are not refreshed.
After final stats, ended weeks refresh standings/power and release the Press Box.
Offline gaps catch up two historical dates per cycle. Failed stages retry.
Credentials stay in memory: CONVEX_SERVER_SECRET or the signed-in Convex CLI.
`;

async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean" },
      apply: { type: "boolean" },
      deployment: { type: "string" },
      "league-id": { type: "string" },
      "season-id": { type: "string" },
      "start-date": { type: "string" },
      "end-date": { type: "string" },
      "nhl-end-date": { type: "string" },
      "python-bin": { type: "string" },
      "superseded-backup-dir": { type: "string" },
      "state-dir": { type: "string" },
      "skip-weekly-rollover": { type: "boolean" },
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
  const nhlEndDate = values["nhl-end-date"] ?? endDate;
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(deployment) ||
    !/^\d+$/.test(leagueId) ||
    !/^[a-zA-Z0-9]+$/.test(seasonId)
  )
    throw new Error(
      "Explicit deployment, numeric league ID and season ID are required.",
    );
  for (const date of [startDate, endDate, nhlEndDate])
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      throw new Error("Valid season start/end dates are required.");
  if (startDate > endDate) throw new Error("Season date range is reversed.");
  if (nhlEndDate < endDate)
    throw new Error("NHL season cannot end before the GSHL scoring range.");
  const directory = path.resolve(
    root,
    values["state-dir"] ?? ".local-data/yahoo-sync",
  );
  fs.mkdirSync(directory, { recursive: true });
  const scope = `${deployment}-${leagueId}-${seasonId}`;
  const statePath = path.join(directory, `${scope}.json`);
  const lockPath = path.join(directory, `${scope}.lock`);
  const scopeKey = `${scope}:${startDate}:${endDate}${nhlEndDate === endDate ? "" : `:${nhlEndDate}`}`;
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
  let plan = planYahooSyncCycle({
    now,
    startDate,
    endDate,
    nhlEndDate,
    checkpoint,
  });
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
    if (
      plan.active ||
      (startDate <= plan.nhlDate && plan.nhlDate <= endDate) ||
      (startDate <= plan.today &&
        plan.today <=
          new Date(Date.parse(nhlEndDate) + 2 * 86400000)
            .toISOString()
            .slice(0, 10))
    ) {
      try {
        const previousDate = new Date(Date.parse(plan.today) - 86400000)
          .toISOString()
          .slice(0, 10);
        const nightlyTarget =
          previousDate < nhlEndDate ? previousDate : nhlEndDate;
        const [games, previousGames, nightlyGames] = await Promise.all([
          fetchDailyGameStatus(plan.today),
          fetchDailyGameStatus(previousDate),
          nightlyTarget !== previousDate
            ? fetchDailyGameStatus(nightlyTarget)
            : Promise.resolve(undefined),
        ]);
        plan = planYahooSyncCycle({
          now,
          startDate,
          endDate,
          nhlEndDate,
          checkpoint,
          games,
          previousGames,
          nightlyGames,
        });
      } catch {
        log(
          "NHL schedule status unavailable; using hourly fallback and deferring the overnight finalization.",
        );
      }
    }
    log(
      JSON.stringify({
        deployment,
        leagueId,
        seasonId,
        apply: !!values.apply,
        ...plan,
      }),
    );
    if (
      !plan.windowOpen ||
      (!plan.scrapeYahoo &&
        !plan.refreshNhl &&
        !plan.nightlyDate &&
        !plan.historyDates.length &&
        (values["skip-weekly-rollover"] ||
          !plan.morning ||
          checkpoint.morningRecheckOn !== plan.today ||
          !checkpoint.reconciledThrough))
    ) {
      log("Outside sync hours or no work due; no Yahoo/NHL requests.");
      fs.writeFileSync(
        statusPath,
        JSON.stringify(
          {
            scopeKey,
            status: values.apply ? "idle" : "dry-run",
            finishedAt: new Date().toISOString(),
            plan,
          },
          null,
          2,
        ),
      );
      return;
    }
    secret = process.env.CONVEX_SERVER_SECRET?.trim() ?? "";
    if (!secret) {
      const auth = spawnSync(
        process.execPath,
        [
          "--use-system-ca",
          path.join(
            path.dirname(fileURLToPath(import.meta.resolve("convex/package.json"))),
            "bin/main.js",
          ),
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
          "--dns-result-order=ipv4first",
          "--import",
          "tsx",
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
          ...(values["superseded-backup-dir"]
            ? ["--superseded-backup-dir", values["superseded-backup-dir"]]
            : []),
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
      return true;
    };
    const failures: string[] = [];
    if (plan.scrapeYahoo) {
      try {
        run(plan.today, [
          "--current-rosters",
          "--aggregate",
          "--aggregate-mode",
          "frequent",
        ]);
        if (values.apply) {
          checkpoint.lastYahooSyncAt = now.getTime();
          if (plan.allGamesStarted)
            checkpoint.lockedRosterDates = [
              ...new Set([...(checkpoint.lockedRosterDates ?? []), plan.today]),
            ];
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
    // A Yahoo login/roster failure does not block NHL updates from stored lineups.
    if (plan.refreshNhl) {
      try {
        for (const date of plan.refreshDates)
          run(date, ["--nhl-only", "--aggregate-mode", "frequent"]);
        if (values.apply) {
          checkpoint.lastNhlSyncAt = now.getTime();
          save();
        }
      } catch (error) {
        failures.push(
          error instanceof Error ? error.message : "NHL refresh failed.",
        );
      }
    }
    if (plan.nightlyDate) {
      try {
        // Recheck immediately before starting; a stale plan never authorizes finalization.
        if (
          !allScoringGamesFinished(await fetchDailyGameStatus(plan.nightlyDate))
        )
          throw new Error(
            "Nightly refresh deferred: the scoring slate is not final.",
          );
        run(plan.nightlyDate < endDate ? plan.nightlyDate : endDate, [
          "--nhl-only",
          "--aggregate-mode",
          "overnight",
        ]);
        const nightly = spawnSync(
          process.execPath,
          [
            "--use-system-ca",
            "--dns-result-order=ipv4first",
            "--import",
            "tsx",
            path.join(
              root,
              "scripts/src/commands/stats/refresh-nightly-nhl-stats.ts",
            ),
            "--target",
            "production",
            "--season-id",
            seasonId,
            "--date",
            plan.nightlyDate,
            ...(values.apply ? ["--apply"] : []),
          ],
          {
            cwd: path.join(root, "scripts"),
            encoding: "utf8",
            windowsHide: true,
            timeout: 60 * 60_000,
            maxBuffer: 8 * 1024 * 1024,
            env: {
              ...process.env,
              GSHL_CONVEX_TARGET: "production",
              CONVEX_PROD_URL: `https://${deployment}.convex.cloud`,
              CONVEX_SERVER_SECRET: secret,
            },
          },
        );
        if (nightly.stdout) log(nightly.stdout);
        if (nightly.stderr) log(nightly.stderr);
        if (nightly.status !== 0)
          throw new Error(
            "Nightly NHL season refresh did not finish; completion was not advanced.",
          );
        if (values.apply) {
          checkpoint.nightlyCompletedThrough = plan.nightlyDate;
          save();
        }
      } catch (error) {
        failures.push(
          error instanceof Error ? error.message : "Nightly refresh failed.",
        );
      }
    }
    const completed = new Set<string>();
    for (const date of plan.historyDates) {
      try {
        if (!allScoringGamesFinished(await fetchDailyGameStatus(date)))
          throw new Error(
            `NHL games for ${date} are not final; morning reconciliation will retry.`,
          );
        const finished = run(
          date,
          checkpoint.lockedRosterDates?.includes(date)
            ? ["--nhl-only"]
            : ["--sync-nhl", "--aggregate"],
        );
        if (!finished) break;
        completed.add(date);
        if (values.apply) {
          checkpoint.lockedRosterDates = [
            ...new Set([...(checkpoint.lockedRosterDates ?? []), date]),
          ];
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
    // Correct every prior day of an open matchup, not only a two-day lookback.
    // Finalized weeks are excluded by the persisted weekly handoff marker.
    if (
      !plan.overnight &&
      !plan.liveGames &&
      (plan.refreshNhl || plan.historyDates.length)
    ) {
      if (
        !run(plan.active ? plan.today : endDate, [
          "--refresh-open-weeks",
          "--correction-week-limit",
          "2",
        ])
      )
        throw new Error(
          "Full-matchup correction refresh deferred; rollover must wait.",
        );
    }
    if (
      plan.morning &&
      !plan.liveGames &&
      !values["skip-weekly-rollover"] &&
      checkpoint.morningRecheckOn === plan.today &&
      checkpoint.reconciledThrough
    ) {
      const weekly = spawnSync(
        process.execPath,
        [
          "--use-system-ca",
          "--dns-result-order=ipv4first",
          "--import",
          "tsx",
          path.join(root, "scripts/src/commands/stats/run-weekly-rollover.ts"),
          "--season-id",
          seasonId,
          "--reconciled-through",
          checkpoint.reconciledThrough,
          "--morning-recheck-on",
          checkpoint.morningRecheckOn,
          "--python-bin",
          values["python-bin"] ?? "python",
          ...(values.apply ? ["--apply"] : []),
        ],
        {
          cwd: path.join(root, "scripts"),
          encoding: "utf8",
          windowsHide: true,
          timeout: 60 * 60_000,
          maxBuffer: 8 * 1024 * 1024,
          env: {
            ...process.env,
            GSHL_CONVEX_TARGET: "production",
            CONVEX_PROD_URL: `https://${deployment}.convex.cloud`,
            CONVEX_SERVER_SECRET: secret,
          },
        },
      );
      if (weekly.stdout) log(weekly.stdout);
      if (weekly.stderr) log(weekly.stderr);
      if (weekly.status !== 0)
        throw new Error("Weekly rollover failed; it will retry next cycle.");
    }
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

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Yahoo cycle failed.");
  process.exitCode = 1;
});
