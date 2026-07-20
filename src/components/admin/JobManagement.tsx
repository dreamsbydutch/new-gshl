"use client";

import { useMemo, useState } from "react";
import { useJobAdmin, useSeasons, useTeams, useWeeks } from "@gshl-hooks";
import type { GSHLTeam } from "@gshl-types";
import { Button } from "@gshl-ui";

const activeStatuses = new Set([
  "queued",
  "running",
  "waiting_external",
  "cancelling",
]);

function formatTime(value?: number) {
  return value ? new Date(value).toLocaleString() : "—";
}

export function JobManagement() {
  const { catalog, runs, start, cancel, retry } = useJobAdmin();
  const [jobName, setJobName] = useState("season-stat-aggregation");
  const [seasonId, setSeasonId] = useState("");
  const [weekNum, setWeekNum] = useState("");
  const [teamId, setTeamId] = useState("");
  const [matchupId, setMatchupId] = useState("");
  const [apply, setApply] = useState(false);
  const sortedRuns = useMemo(() => runs.data ?? [], [runs.data]);
  const isYahooPlayerDayBackfill =
    jobName === "yahoo-matchup-player-day-backfill";
  const seasonsQuery = useSeasons({ orderBy: { year: "desc" } });
  const weeksQuery = useWeeks({
    seasonId,
    enabled: isYahooPlayerDayBackfill && Boolean(seasonId),
  });
  const teamsQuery = useTeams({
    seasonId,
    enabled: isYahooPlayerDayBackfill && Boolean(seasonId),
  });
  const weeks = useMemo(
    () =>
      [...weeksQuery.data].sort((left, right) => left.weekNum - right.weekNum),
    [weeksQuery.data],
  );
  const teams = useMemo(
    () =>
      ([...teamsQuery.data] as GSHLTeam[]).sort((left, right) =>
        String(left.name ?? left.abbr ?? "").localeCompare(
          String(right.name ?? right.abbr ?? ""),
        ),
      ),
    [teamsQuery.data],
  );

  const selectSeason = (value: string) => {
    setSeasonId(value);
    setWeekNum("");
    setTeamId("");
  };

  const startJob = () => {
    const args: Record<string, string> = {};
    const normalizedSeasonId = seasonId.trim();
    const normalizedWeekNum = weekNum.trim();
    const normalizedTeamId = teamId.trim();
    const normalizedMatchupId = matchupId.trim();
    if (normalizedSeasonId) args.seasonId = normalizedSeasonId;
    if (isYahooPlayerDayBackfill && normalizedWeekNum) {
      args.weekNum = normalizedWeekNum;
    }
    if (isYahooPlayerDayBackfill && normalizedTeamId) {
      args.teamIds = normalizedTeamId;
    }
    if (isYahooPlayerDayBackfill && normalizedMatchupId) {
      args.matchupId = normalizedMatchupId;
    }
    start.mutate({ jobName, apply, args });
  };

  return (
    <section className="mx-auto max-w-6xl space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-bold">Operational Jobs</h1>
        <p className="text-sm text-muted-foreground">
          Runs are dry-run by default. Apply must be selected explicitly.
        </p>
      </div>

      <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Job</span>
          <select
            className="w-full rounded border bg-white px-3 py-2"
            value={jobName}
            onChange={(event) => setJobName(event.target.value)}
          >
            {(catalog.data?.jobs ?? []).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {isYahooPlayerDayBackfill ? (
          <label className="text-sm">
            <span className="mb-1 block font-medium">Season</span>
            <select
              className="w-full rounded border bg-white px-3 py-2"
              value={seasonId}
              onChange={(event) => selectSeason(event.target.value)}
            >
              <option value="">Choose a season</option>
              {seasonsQuery.data.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name || season.year}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="text-sm">
            <span className="mb-1 block font-medium">Season ID (optional)</span>
            <input
              className="w-full rounded border px-3 py-2"
              value={seasonId}
              onChange={(event) => setSeasonId(event.target.value)}
              placeholder="Convex season ID"
            />
          </label>
        )}
        {isYahooPlayerDayBackfill ? (
          <label className="text-sm">
            <span className="mb-1 block font-medium">Week</span>
            <select
              className="w-full rounded border bg-white px-3 py-2"
              value={weekNum}
              onChange={(event) => setWeekNum(event.target.value)}
              disabled={!seasonId || weeksQuery.isLoading}
            >
              <option value="">All weeks</option>
              {weeks.map((week) => (
                <option key={week.id} value={String(week.weekNum)}>
                  Week {week.weekNum}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {isYahooPlayerDayBackfill ? (
          <label className="text-sm">
            <span className="mb-1 block font-medium">Team / franchise</span>
            <select
              className="w-full rounded border bg-white px-3 py-2"
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
              disabled={!seasonId || teamsQuery.isLoading}
            >
              <option value="">All teams</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name ?? team.abbr ?? team.franchiseId}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {isYahooPlayerDayBackfill ? (
          <label className="text-sm">
            <span className="mb-1 block font-medium">
              Matchup ID (optional)
            </span>
            <input
              className="w-full rounded border px-3 py-2"
              value={matchupId}
              onChange={(event) => setMatchupId(event.target.value)}
              placeholder="Matchup ID"
            />
          </label>
        ) : null}
        <label className="flex items-end gap-2 pb-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={apply}
            onChange={(event) => setApply(event.target.checked)}
          />{" "}
          Apply changes
        </label>
        <Button
          className="self-end"
          disabled={
            start.isPending ||
            !jobName ||
            (isYahooPlayerDayBackfill && !seasonId.trim())
          }
          onClick={startJob}
        >
          {start.isPending
            ? "Starting…"
            : apply
              ? "Start apply run"
              : "Start dry run"}
        </Button>
      </div>
      {start.error ? (
        <p className="text-sm text-red-600">{start.error.message}</p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="px-3 py-2">Job</th>
              <th className="px-3 py-2">Mode</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Progress</th>
              <th className="px-3 py-2">Started</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedRuns.map((run) => {
              const progress = run.progress ?? {};
              return (
                <tr key={run.id} className="border-t align-top">
                  <td className="px-3 py-3">
                    <div className="font-medium">{run.jobName}</div>
                    <div className="text-xs text-muted-foreground">
                      {run.requestedBy}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {run.apply ? "Apply" : "Dry run"}
                    <div className="text-xs text-muted-foreground">
                      {run.mode}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded bg-gray-100 px-2 py-1">
                      {run.status}
                    </span>
                    {run.error ? (
                      <div className="mt-1 max-w-72 text-xs text-red-600">
                        {run.error}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {Number(progress.processed ?? 0)} processed
                    <br />
                    {Number(progress.updated ?? 0)} changed
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {formatTime(run.startedAt ?? run.createdAt)}
                  </td>
                  <td className="px-3 py-3">
                    {activeStatuses.has(run.status) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={cancel.isPending}
                        onClick={() => cancel.mutate({ runId: run.id })}
                      >
                        Cancel
                      </Button>
                    ) : null}
                    {["failed", "cancelled"].includes(run.status) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={retry.isPending}
                        onClick={() => retry.mutate({ runId: run.id })}
                      >
                        Retry
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
