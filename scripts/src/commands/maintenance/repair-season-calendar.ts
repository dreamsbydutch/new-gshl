import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { env } from "../../env";
import * as store from "../../integrations/data/convex-store";
import { planSeasonCalendar } from "../../domains/maintenance/season-calendar";

const help = `Repair an upcoming GSHL season calendar from the NHL regular-season bounds.
Run from scripts/: node ../node_modules/tsx/dist/cli.mjs src/commands/maintenance/repair-season-calendar.ts [options]
  --season-id <id>     Required canonical GSHL season ID.
  --target <name>      Required: development (including previews) or production.
  --expected-host <h>  Required exact Convex hostname; refuses a different target.
  --report <path>      Required local JSON report path.
  --apply              Apply the reviewed plan; default is read-only dry run.
  --expect-hash <hash>  Required for apply; source and NHL bounds must still match.
  --help               Show help without reading data.
Targets explicitly selected Convex. Preserves week IDs/playoff rounds,
extends partial boundary weeks, and keeps the last three weeks as playoffs.
Refuses started seasons, existing matchups/day/week stats, or removing weeks.
Writes only season start/end dates and calendar fields on weeks; may add regular weeks.
No deletes, data replacement, deployment, roster rebuild, or matchup creation.`;

const row = z.object({ id: z.string() }).passthrough();
const seasonSchema = row.extend({
  year: z.union([z.string(), z.number()]),
  startDate: z.string(),
  endDate: z.string(),
});
const weekSchema = row.extend({
  seasonId: z.string(),
  weekNum: z.union([z.string(), z.number()]),
  weekType: z.string(),
  isPlayoffs: z.boolean(),
  startDate: z.string(),
  endDate: z.string(),
  gameDays: z.union([z.string(), z.number()]),
});

async function main() {
  const { values } = parseArgs({
    options: {
      "season-id": { type: "string" },
      target: { type: "string" },
      "expected-host": { type: "string" },
      report: { type: "string" },
      apply: { type: "boolean" },
      "expect-hash": { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(help);
    return;
  }
  const seasonId = values["season-id"];
  if (!seasonId || !values.report)
    throw new Error("--season-id and --report are required");
  if (values.apply && !values["expect-hash"])
    throw new Error("Apply requires a reviewed --expect-hash");
  const targetMode = values.target;
  if (targetMode !== "production" && targetMode !== "development")
    throw new Error(
      "--target must explicitly select production or development",
    );
  const deployment =
    env.CONVEX_DEPLOYMENT ?? env.CONVEX_DEPLOY_KEY?.split("|", 1)[0];
  const url =
    targetMode === "development"
      ? (env.NEXT_PUBLIC_CONVEX_URL ?? env.CONVEX_URL)
      : (env.CONVEX_PROD_URL ??
        (deployment?.startsWith("prod:")
          ? `https://${deployment.slice(5)}.convex.cloud`
          : undefined));
  if (!url) throw new Error("An explicit database target is required");
  const target = new URL(url).hostname;
  if (values["expected-host"] !== target)
    throw new Error("Database hostname does not match --expected-host");
  store.configureConvexTarget(targetMode);
  const read = async () => {
    const [seasons, weeks, ...dependents] = await Promise.all([
      store.fetchModel("Season"),
      store.fetchSeasonModel("Week", seasonId),
      ...(
        [
          "Matchup",
          "PlayerDayStatLine",
          "PlayerWeekStatLine",
          "TeamDayStatLine",
          "TeamWeekStatLine",
        ] as const
      ).map((model) => store.fetchSeasonModel(model, seasonId)),
    ]);
    const season = seasonSchema.parse(
      seasons.find((item) => item.id === seasonId),
    );
    return {
      season,
      weeks: weeks
        .map((week) => weekSchema.parse(week))
        .sort((a, b) => a.id.localeCompare(b.id)),
      dependentCounts: dependents.map((items) => items.length),
    };
  };
  const source = await read();
  const endingYear = Number(source.season.year);
  const nhlSeason = (endingYear - 1) * 10000 + endingYear;
  const response = await fetch("https://api-web.nhle.com/v1/standings-season", {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("NHL season catalog unavailable");
  const catalog = z
    .object({
      seasons: z.array(
        z.object({
          id: z.number(),
          standingsStart: z.string(),
          standingsEnd: z.string(),
        }),
      ),
    })
    .parse(await response.json());
  const nhl = catalog.seasons.find((season) => season.id === nhlSeason);
  if (!nhl) throw new Error("Selected NHL season has no published calendar");
  const plan = planSeasonCalendar(
    seasonId,
    source.weeks,
    nhl.standingsStart,
    nhl.standingsEnd,
  );
  const seasonPatch =
    source.season.startDate !== nhl.standingsStart ||
    source.season.endDate !== nhl.standingsEnd
      ? { startDate: nhl.standingsStart, endDate: nhl.standingsEnd }
      : null;
  const issues: string[] = [];
  if (source.dependentCounts.some((count) => count > 0))
    issues.push("Season already has matchups or day/week statistics");
  if (nhl.standingsStart <= new Date().toISOString().slice(0, 10))
    issues.push("NHL season has already started");
  const hash = createHash("sha256")
    .update(JSON.stringify({ target, source, nhl, plan, seasonPatch, issues }))
    .digest("hex");
  const reportPath = resolve(values.report);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        target,
        seasonId,
        nhl,
        hash,
        mode: values.apply ? "apply" : "dry-run",
        plan,
        seasonPatch,
        dependentCounts: source.dependentCounts,
        issues,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      target,
      seasonId,
      nhlSeason,
      hash,
      updates: plan.updates.length,
      inserts: plan.inserts.length,
      seasonPatch,
      dependentCounts: source.dependentCounts,
      issues,
      reportPath,
    }),
  );
  console.table(plan.calendar);
  if (!values.apply) return;
  if (issues.length || values["expect-hash"] !== hash)
    throw new Error("Apply blocked: source changed or preflight issues exist");
  if (!plan.updates.length && !plan.inserts.length && !seasonPatch) return;
  const beforePath = `${reportPath}.before.json`;
  await writeFile(beforePath, JSON.stringify({ target, ...source }, null, 2), {
    flag: "wx",
  });
  if (JSON.stringify(await read()) !== JSON.stringify(source))
    throw new Error("Source changed after preflight; no writes applied");
  // Update existing weeks before inserting, preserving playoff IDs and rounds.
  for (const change of plan.updates)
    await store.updateById("Week", change.id, change.data);
  if (plan.inserts.length) {
    const now = new Date().toISOString();
    await store.upsertByCompositeKey(
      "Week",
      ["seasonId", "weekNum"],
      plan.inserts.map((week) => ({ ...week, createdAt: now, updatedAt: now })),
      { merge: true },
    );
  }
  if (seasonPatch) await store.updateById("Season", seasonId, seasonPatch);
  const after = await read();
  const remaining = planSeasonCalendar(
    seasonId,
    after.weeks,
    nhl.standingsStart,
    nhl.standingsEnd,
  );
  if (
    remaining.updates.length ||
    remaining.inserts.length ||
    after.season.startDate !== nhl.standingsStart ||
    after.season.endDate !== nhl.standingsEnd
  )
    throw new Error(
      "Calendar verification failed; inspect the before-image and rerun dry-run",
    );
  await writeFile(
    `${reportPath}.verified.json`,
    JSON.stringify(
      { target, seasonId, weeks: after.weeks, remainingChanges: 0 },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ applied: true, verified: true, remainingChanges: 0 }),
  );
}

main().catch((error: unknown) => {
  let message =
    error instanceof Error ? error.message : "Calendar repair failed";
  for (const secret of [env.CONVEX_SERVER_SECRET, env.CONVEX_DEPLOY_KEY])
    if (secret) message = message.replaceAll(secret, "<REDACTED>");
  console.error(message);
  process.exitCode = 1;
});
