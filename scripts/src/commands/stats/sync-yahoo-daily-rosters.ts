import { isDeepStrictEqual, parseArgs } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  configureConvexTarget,
  fetchModel,
  fetchSeasonModel,
  fetchPlayerDayDate,
  updateById,
  upsertAggregateRows,
  removeSupersededYahooDays,
} from "../../integrations/data/convex-store";
import {
  fetchDailyYahooRoster,
  closeYahooBrowserSession,
} from "../../integrations/yahoo/daily-roster";
import {
  planDailyYahooRosters,
  type RosterDay,
  type RosterIdentity,
} from "../../domains/yahoo/daily-roster";
import { applyYahooBrowserArgOverrides } from "../../domains/yahoo/matchup-utils";
import { normalizeDateOnlyValue } from "../../utils/date";
import { planDailyRosterMaintenance } from "../../domains/yahoo/daily-roster-maintenance";
import { getLineupBuilder } from "../../domains/lineup/lineup-builder";
import type { DatabaseRecord } from "../../integrations/data/records";
import { refreshDailySeasonAggregates } from "../../domains/aggregation/daily-season-aggregation";
import { shiftYahooDate } from "../../domains/yahoo/sync-cycle";
import { backupSupersededYahooDays } from "../../integrations/yahoo/superseded-roster-backup";

const HELP = `Usage: npm.cmd run stats:sync-yahoo-daily-rosters -- --target production --league-id 44541

Creates/patches one day's roster metadata from every Yahoo team, then optionally
runs the NHL daily stats sync. Defaults to a dry run and today in America/Toronto.
Yahoo supplies team membership, eligibility and daily slot; NHL supplies stats.

  --target production|development  Required explicit Convex environment.
  --league-id ID                   Required current Yahoo league ID.
  --season-id ID                   Canonical or legacy GSHL season ID. Uses its week calendar.
  --date YYYY-MM-DD                Optional date in the current Yahoo season.
  --apply                         Apply only after reviewing a dry run.
  --superseded-backup-dir PATH        Back up superseded days outside workspace/OneDrive, then delete exact rows.
  --sync-nhl                      After roster apply, refresh NHL stats for this date.
  --nhl-only                      Refresh NHL stats/rollups from stored rosters; never scrape Yahoo.
  --current-rosters               Refresh today's ownership, eligibility, optimizer and buyouts.
  --aggregate                     Rebuild season rollups after this date's import (also for backfills).
  --summary                       Print counts and conflicts instead of all roster-day payloads.
  --daily-pipeline                Run NHL sync, current rosters, optimizer, buyouts and six season rollups.
                                  Current Toronto date only; includes --sync-nhl.
  --python-bin PATH               Python executable for --sync-nhl (default python).
  --browser-fallback true|false    Use the existing Yahoo browser transport.
  --browser-headless true|false    Browser mode (default true for this command).
  --browser-path PATH             Browser executable.
  --browser-user-data-dir PATH    Existing authenticated Yahoo profile.
  --browser-wait-ms MS             Browser login timeout.
  --browser-import-cookie true|false
  --help                          Show help without reading live data.

No stats or Player ownership fields are written by the roster phase. Missing Yahoo
IDs may be filled from a unique exact full-name match; existing IDs are never replaced. Unmatched
Yahoo IDs, duplicate identities and missing existing days block all roster writes.
Missing rows block writes unless --superseded-backup-dir enables backed-up deletion. Whole-league reads
finish before writes start. Interrupted applies may be rerun safely.
`;

async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean" },
      apply: { type: "boolean" },
      "superseded-backup-dir": { type: "string" },
      "sync-nhl": { type: "boolean" },
      "nhl-only": { type: "boolean" },
      "daily-pipeline": { type: "boolean" },
      "current-rosters": { type: "boolean" },
      aggregate: { type: "boolean" },
      summary: { type: "boolean" },
      target: { type: "string" },
      "league-id": { type: "string" },
      "season-id": { type: "string" },
      "python-bin": { type: "string" },
      date: { type: "string" },
      "browser-fallback": { type: "string" },
      "browser-headless": { type: "string" },
      "browser-path": { type: "string" },
      "browser-user-data-dir": { type: "string" },
      "browser-wait-ms": { type: "string" },
      "browser-import-cookie": { type: "string" },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  if (values.target !== "production" && values.target !== "development")
    throw new Error("Specify --target production|development.");
  const leagueId = values["league-id"] ?? "";
  if (!/^\d+$/.test(leagueId))
    throw new Error("Specify a numeric --league-id.");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const date = values.date ?? today;
  if ((values["daily-pipeline"] || values["current-rosters"]) && date !== today)
    throw new Error(
      "Current-roster maintenance requires today's Toronto date; use --sync-nhl --aggregate for backfills.",
    );
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  ) {
    throw new Error("--date must be a valid YYYY-MM-DD date.");
  }
  configureConvexTarget(values.target);
  process.env.YAHOO_BROWSER_HEADLESS ??= "true";
  applyYahooBrowserArgOverrides(process.argv.slice(2));
  type CalendarRow = Record<string, unknown> & {
    id: string;
    startDate: unknown;
    endDate: unknown;
  };
  const seasons = await fetchModel<CalendarRow>("Season");
  const coversDate = (row: CalendarRow, targetDate = date) => {
    const start = normalizeDateOnlyValue(row.startDate);
    const end = normalizeDateOnlyValue(row.endDate);
    return !!start && !!end && start <= targetDate && targetDate <= end;
  };
  const selected = seasons.filter((season) =>
    values["season-id"]
      ? season.id === values["season-id"] ||
        String(season.legacyId) === values["season-id"]
      : coversDate(season),
  );
  if (selected.length !== 1)
    throw new Error(
      `Expected one GSHL season for ${date}; found ${selected.length}. Supply --season-id to use its existing week calendar.`,
    );
  const season = selected[0]!;
  const [teams, weeks, players, existing] = await Promise.all([
    fetchSeasonModel<
      Record<string, unknown> & { id: string; yahooId?: string }
    >("Team", season.id),
    fetchSeasonModel<CalendarRow>("Week", season.id),
    fetchModel<Record<string, unknown> & RosterIdentity>("Player"),
    fetchPlayerDayDate<Record<string, unknown> & RosterDay>(season.id, date),
  ]);
  const selectedWeeks = weeks.filter((week) => coversDate(week));
  const lastScoringDate = weeks
    .map((row) => normalizeDateOnlyValue(row.endDate) ?? "")
    .sort()
    .at(-1);
  const finalStatsGrace =
    !!lastScoringDate &&
    date <= lastScoringDate &&
    today > lastScoringDate &&
    today <= shiftYahooDate(lastScoringDate, 2);
  if (!weeks.some((week) => coversDate(week, today)) && !finalStatsGrace) {
    throw new Error(
      "This source uses the current Yahoo league. Historical seasons require the historical backfill command.",
    );
  }
  if (selectedWeeks.length !== 1)
    throw new Error(
      `Expected one GSHL week covering ${date}; found ${selectedWeeks.length}.`,
    );
  const week = selectedWeeks[0]!;
  const syncNhl = async () => {
    const { parseDailyNhlPlayerStatSyncOptions, runDailyNhlPlayerStatSync } =
      await import("../../domains/nhl/daily-player-stats-sync");
    const result = await runDailyNhlPlayerStatSync(
      parseDailyNhlPlayerStatSyncOptions([
        "--season-id",
        season.id,
        "--date",
        date,
        "--team-ids",
        teams.map((team) => team.id).join(","),
        ...(values.apply ? ["--apply"] : []),
        "--ssl-verify",
        "true",
        "--python-bin",
        values["python-bin"] ?? "python",
      ]),
    );
    console.log(JSON.stringify(result, null, 2));
    if (result.skippedDates.length || !result.datesSynced.includes(date))
      throw new Error(
        "NHL sync did not complete the requested date; later stages were not run.",
      );
  };
  if (values["nhl-only"]) {
    if (
      !teams.length ||
      teams.some((team) => !existing.some((row) => row.gshlTeamId === team.id))
    )
      throw new Error(
        "NHL-only sync requires stored player days for every season team.",
      );
    console.log(
      JSON.stringify({
        stage: "nhl-only",
        date,
        seasonId: season.id,
        apply: !!values.apply,
      }),
    );
    await syncNhl();
    console.log(
      JSON.stringify(
        await refreshDailySeasonAggregates(
          season as DatabaseRecord & { id: string },
          !!values.apply,
        ),
        null,
        2,
      ),
    );
    return;
  }
  if (
    !teams.length ||
    teams.some((team) => !/^\d+$/.test(String(team.yahooId ?? ""))) ||
    new Set(teams.map((team) => String(team.yahooId))).size !== teams.length
  ) {
    throw new Error(
      "Every GSHL team needs a unique Yahoo team ID before importing the league.",
    );
  }
  console.log(
    JSON.stringify({
      target: values.target,
      leagueId,
      seasonId: season.id,
      weekId: week.id,
      date,
      teams: teams.length,
      apply: !!values.apply,
    }),
  );
  const rosters = [];
  for (const team of teams) {
    const roster = await fetchDailyYahooRoster(
      leagueId,
      String(team.yahooId),
      date,
    );
    console.log(`Yahoo team ${team.yahooId}: ${roster.length} roster players`);
    rosters.push({ teamId: team.id, players: roster });
  }
  const plan = planDailyYahooRosters({
    removeMissing: !!values["superseded-backup-dir"],
    seasonId: season.id,
    weekId: week.id,
    date,
    rosters,
    players,
    existing: existing.map((row) => ({
      ...row,
      date: normalizeDateOnlyValue(row.date) ?? "",
    })),
  });
  console.log(
    JSON.stringify(
      values.summary
        ? {
            creates: plan.creates.length,
            removals: plan.removals.map((row) => ({
              id: row.id,
              playerId: row.playerId,
              teamId: row.gshlTeamId,
            })),
            updates: plan.updates.length,
            unchanged: plan.unchanged,
            identityUpdates: plan.identityUpdates,
            conflicts: plan.conflicts,
          }
        : plan,
      null,
      2,
    ),
  );
  if (plan.conflicts.length)
    throw new Error("Roster reconciliation needs review. No changes written.");
  const loadMaintenancePlan = async () => {
    const [currentPlayers, contracts, franchises, builder] = await Promise.all([
      fetchModel<Record<string, unknown> & RosterIdentity>("Player"),
      fetchModel<Record<string, unknown> & { id: string }>("Contract"),
      fetchModel<Record<string, unknown> & { id: string }>("Franchise"),
      getLineupBuilder(),
    ]);
    const rosterSpots = Array.isArray(season.rosterSpots)
      ? season.rosterSpots
      : [];
    if (!rosterSpots.length)
      throw new Error("Season roster slots are missing.");
    const slots =
      builder.buildLineupStructureFromRosterSpots?.(rosterSpots) ??
      builder.internals?.buildLineupStructureFromRosterSpots?.(rosterSpots);
    if (!slots)
      throw new Error("Lineup optimizer did not resolve season roster slots.");
    return planDailyRosterMaintenance({
      date,
      today,
      seasonId: season.id,
      seasons,
      teams,
      franchises,
      players: currentPlayers,
      contracts,
      days: plan.rosterDays,
      findBestLineup: (rows) =>
        builder.findBestLineup(rows as DatabaseRecord[], false, slots),
    });
  };
  const maintenance =
    values["daily-pipeline"] || values["current-rosters"]
      ? await loadMaintenancePlan()
      : null;
  if (maintenance) {
    console.log(
      JSON.stringify(
        {
          stage: "current-rosters",
          playerUpdates: maintenance.playerUpdates.length,
          rosterReviews: values.summary
            ? maintenance.rosterReviews.length
            : maintenance.rosterReviews,
          teams: maintenance.lineupTeams,
          buyouts: maintenance.buyouts,
          conflicts: maintenance.conflicts,
        },
        null,
        2,
      ),
    );
    if (maintenance.conflicts.length)
      throw new Error(
        "Current roster/contract reconciliation requires review. No changes written.",
      );
  }
  if (!values.apply) {
    if (values["sync-nhl"] || values["daily-pipeline"])
      console.log(
        "NHL sync deferred until roster apply; new days exist only in this preview.",
      );
    if (values.aggregate || values["daily-pipeline"]) {
      console.log(
        "Aggregate preview uses planned Yahoo metadata and currently stored NHL stats; apply refreshes NHL first. Ratings and power snapshots are preserved.",
      );
      console.log(
        JSON.stringify(
          await refreshDailySeasonAggregates(
            season as DatabaseRecord & { id: string },
            false,
            { date, days: plan.rosterDays },
          ),
          null,
          2,
        ),
      );
    }
    return;
  }
  if (plan.removals.length) {
    // Confirm the full source again before backing up/removing any scored rows.
    const confirmedRosters = [];
    for (const team of teams)
      confirmedRosters.push({
        teamId: team.id,
        players: await fetchDailyYahooRoster(
          leagueId,
          String(team.yahooId),
          date,
        ),
      });
    const confirmed = planDailyYahooRosters({
      seasonId: season.id,
      weekId: week.id,
      date,
      rosters: confirmedRosters,
      players,
      existing: [],
    });
    const byPlayer = (rows: typeof plan.rosterDays) =>
      [...rows].sort((a, b) => a.playerId.localeCompare(b.playerId));
    if (
      confirmed.conflicts.length ||
      !isDeepStrictEqual(
        byPlayer(confirmed.rosterDays),
        byPlayer(plan.rosterDays),
      )
    )
      throw new Error(
        "Yahoo lineup changed during capture; retry before backup.",
      );
    const fresh = await fetchPlayerDayDate<Record<string, unknown> & RosterDay>(
      season.id,
      date,
    );
    const rows = plan.removals.map(
      (row) => existing.find((stored) => stored.id === row.id)!,
    );
    if (
      rows.some(
        (row) =>
          !isDeepStrictEqual(
            row,
            fresh.find((current) => current.id === row.id),
          ),
      )
    )
      throw new Error(
        "Superseded player days changed during capture; retry before backup.",
      );
    const backup = await backupSupersededYahooDays({
      workspaceRoot: resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../../../..",
      ),
      backupDirectory: values["superseded-backup-dir"]!,
      scope: { target: values.target, leagueId, seasonId: season.id, date },
      rows,
      replacementRoster: plan.rosterDays,
    });
    console.log(JSON.stringify({ stage: "superseded-day-backup", ...backup }));
    for (let offset = 0; offset < rows.length; offset += 25) {
      const batch = rows.slice(offset, offset + 25);
      const removed = await removeSupersededYahooDays({
        seasonId: season.id,
        date,
        backupSha256: backup.sha256,
        expected: batch,
      });
      if (removed.deleted !== batch.length)
        throw new Error(
          "Superseded-day deletion count differs from the verified backup.",
        );
    }
  }
  for (const update of plan.identityUpdates)
    await updateById("Player", update.id, { yahooId: update.yahooId });
  for (const update of plan.updates)
    await updateById("PlayerDayStatLine", update.id, update.data);
  for (let offset = 0; offset < plan.creates.length; offset += 25) {
    await upsertAggregateRows(
      "PlayerDayStatLine",
      plan.creates.slice(offset, offset + 25),
    );
  }
  const [after, updatedPlayers] = await Promise.all([
    fetchPlayerDayDate<Record<string, unknown> & RosterDay>(season.id, date),
    fetchModel<Record<string, unknown> & RosterIdentity>("Player"),
  ]);
  const remaining = planDailyYahooRosters({
    seasonId: season.id,
    weekId: week.id,
    date,
    rosters,
    players: updatedPlayers,
    existing: after.map((row) => ({
      ...row,
      date: normalizeDateOnlyValue(row.date) ?? "",
    })),
  });
  if (
    remaining.creates.length ||
    remaining.identityUpdates.length ||
    remaining.updates.length ||
    remaining.conflicts.length
  ) {
    throw new Error(
      "Roster verification still has differences; rerun the dry run.",
    );
  }
  console.log(
    `Verified ${remaining.unchanged} roster days; no remaining metadata differences.`,
  );
  if (values["sync-nhl"] || values["daily-pipeline"]) {
    await syncNhl();
  }
  if (maintenance) {
    // Confirm the full league membership again before any irreversible contract change.
    // This also catches a player picked up by another Yahoo team during the NHL fetch.
    if (maintenance.buyouts.length) {
      for (const captured of rosters) {
        const team = teams.find((row) => row.id === captured.teamId)!;
        const latest = await fetchDailyYahooRoster(
          leagueId,
          String(team.yahooId),
          date,
        );
        const members = (rows: typeof latest) =>
          rows
            .map((p) => p.yahooId)
            .sort()
            .join(",");
        if (members(latest) !== members(captured.players))
          throw new Error(
            "Yahoo league membership changed during import; rerun the preview before buyouts.",
          );
      }
    }
    // Refetch after the NHL stage: ownership/contracts may have changed during capture.
    const current = await loadMaintenancePlan();
    if (JSON.stringify(current) !== JSON.stringify(maintenance))
      throw new Error(
        "Roster or contract state changed during the import; rerun the preview before current-roster writes.",
      );
    for (const update of maintenance.playerUpdates)
      await updateById("Player", update.id, {
        ...update.data,
        updatedAt: Date.now(),
      });
    for (const buyout of maintenance.buyouts)
      await updateById("Contract", buyout.id, {
        ...buyout.data,
        updatedAt: Date.now(),
      });
    const verified = await loadMaintenancePlan();
    if (
      verified.playerUpdates.length ||
      verified.buyouts.length ||
      verified.conflicts.length
    )
      throw new Error(
        "Current roster/buyout verification has remaining differences; rerun the preview.",
      );
    console.log(
      `Verified current rosters and optimized lineups for ${teams.length} teams; processed ${maintenance.buyouts.length} buyouts.`,
    );
  }
  if (values.aggregate || values["daily-pipeline"]) {
    console.log(
      JSON.stringify(
        await refreshDailySeasonAggregates(
          season as DatabaseRecord & { id: string },
          true,
        ),
        null,
        2,
      ),
    );
  }
}

void main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Daily roster sync failed.",
    );
    process.exitCode = 1;
  })
  .finally(() => closeYahooBrowserSession());
