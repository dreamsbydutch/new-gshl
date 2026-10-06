import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { env } from "../../env";
import {
  fetchModel,
  fetchSeasonModel,
} from "../../integrations/data/convex-store";
import { fetchDailyGameStatus } from "../../integrations/nhl/daily-game-status";
import { shiftYahooDate } from "../../domains/yahoo/sync-cycle";
import { refreshOpenWeekStats } from "../../domains/nhl/refresh-open-week-stats";
import type { DatabaseRecord } from "../../integrations/data/records";
import {
  allScoringGamesFinished,
  dueWeeklyRollovers,
  runWeeklyRollover,
} from "../../domains/yahoo/weekly-rollover";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const dateKey = (value: unknown) => {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime()))
    throw new Error("Invalid scoring-week date");
  return date.toISOString().slice(0, 10);
};

async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean" },
      apply: { type: "boolean" },
      "allow-outside-window": { type: "boolean" },
      "season-id": { type: "string" },
      "reconciled-through": { type: "string" },
      "morning-recheck-on": { type: "string" },
      "python-bin": { type: "string" },
    },
  });
  if (values.help) {
    console.log(
      "Weekly rollover after final NHL imports. Dry run by default.\n--season-id ID --reconciled-through YYYY-MM-DD --morning-recheck-on YYYY-MM-DD [--apply] [--allow-outside-window] [--python-bin PATH]\nUses the explicit CONVEX_PROD_URL and CONVEX_SERVER_SECRET supplied by the Yahoo cycle.\nRechecks the full ended matchup for NHL corrections, rebuilds results, power and standings, then freezes stats and hands the week to the Press Box.\n--allow-outside-window permits an explicit operator catch-up after daytime hours; scheduled cycles never pass it.",
    );
    return;
  }
  if (!values["season-id"] || !env.CONVEX_PROD_URL || !env.CONVEX_SERVER_SECRET)
    throw new Error(
      "Explicit season, production URL and server credential required",
    );
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const part = (key: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === key)!.value;
  if (
    !values["allow-outside-window"] &&
    (Number(part("hour")) < 8 || Number(part("hour")) > 22)
  ) {
    console.log("Outside the daytime window; no weekly work applied.");
    return;
  }
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const seasons = await fetchModel<Record<string, unknown>>("Season");
  const season = seasons.find((row) =>
    [row.id, row.legacyId].some((id) => String(id) === values["season-id"]),
  );
  if (!season) throw new Error("Season not found");
  const seasonId = String(season.id);
  const weeks = await fetchSeasonModel<Record<string, unknown>>(
    "Week",
    seasonId,
  );
  const due = dueWeeklyRollovers({
    today,
    reconciledThrough: values["reconciled-through"],
    morningRecheckOn: values["morning-recheck-on"],
    weeks: weeks.map((row) => ({
      id: String(row.id),
      startDate: dateKey(row.startDate),
      endDate: dateKey(row.endDate),
      weeklyRefreshCompletedAt:
        Number(row.weeklyRefreshCompletedAt) || undefined,
    })),
  });
  if (!due.length) {
    console.log("No weekly rollover due.");
    return;
  }
  // Standings rebuilds the whole season, so validate every pending week first.
  const matchups = await fetchSeasonModel<Record<string, unknown>>(
    "Matchup",
    seasonId,
  );
  const teamWeeks = await fetchSeasonModel<Record<string, unknown>>(
    "TeamWeekStatLine",
    seasonId,
  );
  for (const week of due) {
    const games = matchups.filter((row) => String(row.weekId) === week.id);
    if (
      !games.length ||
      games.some((row) =>
        [row.homeTeamId, row.awayTeamId].some(
          (team) =>
            teamWeeks.filter(
              (stats) =>
                String(stats.weekId) === week.id && stats.gshlTeamId === team,
            ).length !== 1,
        ),
      )
    )
      throw new Error(`Week ${week.id} is missing matchups or team aggregates`);
    for (
      let date = week.startDate;
      date <= week.endDate;
      date = shiftYahooDate(date, 1)
    ) {
      if (!allScoringGamesFinished(await fetchDailyGameStatus(date)))
        throw new Error(
          `NHL games for ${date} have not all finished; rollover deferred`,
        );
    }
  }
  const run = (command: string) => {
    const child = spawnSync(
      process.execPath,
      [
        "--use-system-ca",
        path.join(root, "node_modules/tsx/dist/cli.mjs"),
        path.join(root, "scripts/src/commands", command),
        "--season-id",
        seasonId,
        ...(values.apply ? ["--apply"] : []),
      ],
      {
        cwd: path.join(root, "scripts"),
        encoding: "utf8",
        windowsHide: true,
        timeout: 20 * 60_000,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    for (const output of [child.stdout, child.stderr])
      if (output)
        console.log(output.split(env.CONVEX_SERVER_SECRET!).join("[redacted]"));
    if (child.status !== 0) throw new Error(`Weekly stage ${command} failed`);
  };
  const client = new ConvexHttpClient(env.CONVEX_PROD_URL);
  const handoff = makeFunctionReference<"mutation">(
    "weeklyEditions:completeWeeklyRefresh",
  );
  // Do not partially apply from an operator checkout before its backend deploy.
  if (values.apply) {
    for (const week of due)
      await client.mutation(handoff, {
        serverSecret: env.CONVEX_SERVER_SECRET,
        seasonId,
        weekId: week.id,
        preflight: true,
      });
  }
  console.log(
    JSON.stringify({
      seasonId,
      weeks: due.map((w) => w.id),
      apply: !!values.apply,
    }),
  );
  console.log(
    JSON.stringify(
      await refreshOpenWeekStats({
        season: season as DatabaseRecord & { id: string },
        today,
        apply: !!values.apply,
        pythonBin: values["python-bin"] ?? "python",
        weekIds: due.map((week) => week.id),
      }),
      null,
      2,
    ),
  );
  await runWeeklyRollover(
    {
      standings: async () => {
        run("standings/backfill-season-standings.ts");
      },
      power: async () => {
        run("power/rebuild-power-ratings.ts");
      },
      publish: async () => {
        for (const week of due)
          await client.mutation(handoff, {
            serverSecret: env.CONVEX_SERVER_SECRET,
            seasonId,
            weekId: week.id,
            apply: true,
          });
      },
    },
    !!values.apply,
  );
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown rollover error";
  console.error(
    env.CONVEX_SERVER_SECRET
      ? message.split(env.CONVEX_SERVER_SECRET).join("[redacted]")
      : message,
  );
  console.error(
    "Weekly rollover failed; no completion checkpoint was advanced for unfinished weeks. Inspect the preceding stage output.",
  );
  process.exitCode = 1;
});
