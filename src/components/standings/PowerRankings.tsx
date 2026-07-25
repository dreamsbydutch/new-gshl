"use client";

import { useMemo } from "react";
import Image from "next/image";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { PowerRankingEntry, PowerRankingsProps } from "@gshl-types";
import { useAuthSession, useDistinctTeamColors } from "@gshl-hooks";

function RankMovement({ entry }: { entry: PowerRankingEntry }) {
  if (entry.rankChange === null) {
    return <span className="text-[10px] text-slate-400">First rank</span>;
  }
  if (entry.rankChange > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600">
        <ArrowUp className="h-3 w-3" aria-hidden="true" />
        {entry.rankChange}
      </span>
    );
  }
  if (entry.rankChange < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-600">
        <ArrowDown className="h-3 w-3" aria-hidden="true" />
        {Math.abs(entry.rankChange)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400">
      <Minus className="h-3 w-3" aria-hidden="true" />
      Even
    </span>
  );
}

function TeamLogo({ entry }: { entry: PowerRankingEntry }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50">
      {entry.team.logoUrl ? (
        <Image
          src={entry.team.logoUrl}
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 object-contain"
        />
      ) : (
        <span className="text-[9px] font-semibold text-slate-400">
          {(entry.team.abbr ?? entry.team.name ?? "TM")
            .slice(0, 2)
            .toUpperCase()}
        </span>
      )}
    </div>
  );
}

export function PowerRankings({ season, rankings }: PowerRankingsProps) {
  const { session } = useAuthSession();
  const colorSources = useMemo(
    () =>
      rankings.entries.map((entry) => ({
        teamId: entry.team.id,
        logoUrl: entry.team.logoUrl,
        fallbackColor: entry.color,
      })),
    [rankings.entries],
  );
  const teamColors = useDistinctTeamColors(colorSources);

  if (!season) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">
        Select a season to view its power rankings.
      </div>
    );
  }

  const snapshotLabel = season.isActive ? "Current" : "Final";
  const latestWeekLabel = rankings.latestWeek
    ? `through Week ${rankings.latestWeek.weekNum}`
    : "from the season summary";
  const teamCount = Math.max(rankings.series.length, 1);
  const yTicks = Array.from({ length: teamCount }, (_, index) => index + 1);
  const signedInTeamId =
    rankings.entries.find(
      (entry) =>
        session?.user.ownerId &&
        String(entry.team.ownerId) === String(session.user.ownerId),
    )?.team.id ?? null;
  const chartSeries = signedInTeamId
    ? [
        ...rankings.series.filter((team) => team.teamId !== signedInTeamId),
        ...rankings.series.filter((team) => team.teamId === signedInTeamId),
      ]
    : rankings.series;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-2.5 py-3 sm:px-6 sm:py-4 lg:py-6">
      <header className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3.5 shadow-sm sm:px-5 sm:py-4">
        <p className="text-[13px] font-semibold uppercase text-slate-500">
          {season.name} power rankings
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {snapshotLabel} order {latestWeekLabel}, plus every available weekly
          snapshot.
        </p>
      </header>

      {!rankings.entries.length ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="font-oswald text-xl text-slate-900">
            No power rankings available
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            This season does not have a weekly or season power-ranking snapshot.
          </p>
        </section>
      ) : (
        <>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-3 py-3 sm:px-5 sm:py-4">
              <h2 className="font-oswald text-xl text-slate-950 sm:text-2xl">
                {snapshotLabel} ranking
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500 sm:text-xs">
                Movement compares the two most recent ranked weeks.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-xs sm:text-sm">
                <caption className="sr-only">
                  {snapshotLabel} team power rankings for {season.name}
                </caption>
                <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="w-16 px-3 py-2.5 text-center">Rank</th>
                    <th className="px-3 py-2.5 text-left">Team</th>
                    <th className="w-24 px-3 py-2.5 text-center">Movement</th>
                    <th className="w-24 px-3 py-2.5 text-right">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rankings.entries.map((entry) => (
                    <tr
                      key={entry.team.id}
                      className="transition-colors hover:bg-slate-50"
                    >
                      <td className="px-3 py-2.5 text-center font-oswald text-lg font-semibold tabular-nums text-slate-950">
                        {entry.rank}
                      </td>
                      <th
                        scope="row"
                        className="px-3 py-2.5 text-left font-normal"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            className="h-5 w-1 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                teamColors[entry.team.id] ?? entry.color,
                            }}
                            aria-hidden="true"
                          />
                          <TeamLogo entry={entry} />
                          <span className="min-w-0 truncate font-semibold text-slate-900">
                            {entry.team.name ?? entry.team.abbr ?? "Team"}
                          </span>
                        </div>
                      </th>
                      <td className="px-3 py-2.5 text-center">
                        <RankMovement entry={entry} />
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums text-slate-700">
                        {entry.rating === null ? "—" : entry.rating.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
            <div>
              <h2 className="font-oswald text-xl text-slate-950 sm:text-2xl">
                Ranking history
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500 sm:text-xs">
                Rank 1 is shown at the top. Hover or tap the chart for weekly
                positions.
                {signedInTeamId
                  ? " Your team is shown with a thicker line."
                  : ""}
              </p>
            </div>
            {rankings.chartData.length ? (
              <div
                className="mt-4 h-[28rem] w-full"
                aria-label={`Weekly power-ranking history for ${season.name}`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={rankings.chartData}
                    margin={{ top: 12, right: 12, left: -18, bottom: 8 }}
                  >
                    <CartesianGrid
                      strokeDasharray="4 4"
                      stroke="#e2e8f0"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10 }}
                      stroke="#94a3b8"
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      domain={[1, teamCount]}
                      ticks={yTicks}
                      reversed
                      allowDecimals={false}
                      tick={{ fontSize: 10 }}
                      stroke="#94a3b8"
                    />
                    <Tooltip
                      formatter={(value: number, teamId: string) => {
                        const team = rankings.series.find(
                          (item) => item.teamId === teamId,
                        );
                        return [`#${value}`, team?.name ?? teamId];
                      }}
                      contentStyle={{
                        borderRadius: 10,
                        borderColor: "#e2e8f0",
                        boxShadow: "0 8px 20px rgba(15,23,42,.08)",
                        fontSize: 12,
                      }}
                    />
                    {chartSeries.map((team) => {
                      const color = teamColors[team.teamId] ?? team.color;
                      const isSignedInTeam = team.teamId === signedInTeamId;
                      return (
                        <Line
                          key={`${team.teamId}-${color}`}
                          type="monotone"
                          dataKey={team.teamId}
                          name={team.teamId}
                          stroke={color}
                          strokeWidth={isSignedInTeam ? 5 : 2}
                          strokeOpacity={isSignedInTeam ? 1 : 0.68}
                          dot={false}
                          activeDot={{
                            r: isSignedInTeam ? 6 : 4,
                            strokeWidth: 0,
                          }}
                          connectNulls
                          isAnimationActive={false}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="mt-4 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                Weekly ranking history is not available for this season.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
