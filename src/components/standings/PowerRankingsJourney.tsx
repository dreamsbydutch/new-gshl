"use client";

import Image from "next/image";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PowerRankingsViewModel } from "@gshl-types";
import { usePowerRankingJourney } from "@gshl-hooks/features/usePowerRankingJourney";

export function PowerRankingsJourney({
  rankings,
}: {
  rankings: PowerRankingsViewModel;
}) {
  const { focused, chartData, lastWeek, orderedEntries, selectTeam } =
    usePowerRankingJourney(rankings);
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 sm:p-5">
      <h2 className="font-oswald text-xl text-slate-900">The season journey</h2>
      <p className="mt-1 text-sm text-slate-500">
        {focused?.team.name ?? focused?.team.abbr ?? "Team"} highlighted. Select
        a logo to follow a team.
      </p>
      <div className="mt-5 flex gap-2 sm:gap-4">
        <div
          className="min-w-0 flex-1"
          style={{ height: Math.max(480, rankings.entries.length * 36) }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 12, right: 10, bottom: 24, left: -25 }}
              accessibilityLayer
            >
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="weekNum"
                type="number"
                domain={[1, Math.max(2, lastWeek)]}
                ticks={Array.from({ length: lastWeek }, (_, i) => i + 1)}
                label={{
                  value: "Regular-season week",
                  position: "insideBottom",
                  offset: -15,
                }}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                reversed
                domain={[1, Math.max(2, rankings.entries.length)]}
                ticks={rankings.entries.map((entry) => entry.rank)}
                allowDecimals={false}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                labelFormatter={(week) => `Week ${week}`}
                formatter={(value, name) => [`#${String(value)}`, name]}
              />
              {orderedEntries.map((entry) => (
                <Line
                  key={entry.team.id}
                  dataKey={entry.team.id}
                  name={entry.team.name ?? entry.team.abbr ?? "Team"}
                  stroke={entry.color}
                  strokeOpacity={entry.team.id === focused?.team.id ? 1 : 0.15}
                  strokeWidth={entry.team.id === focused?.team.id ? 3 : 1.5}
                  dot={{ r: entry.team.id === focused?.team.id ? 3 : 1 }}
                  activeDot={{ r: 5 }}
                  type="linear"
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div
          className="flex shrink-0 flex-col gap-1"
          role="group"
          aria-label="Focus team in current ranking order"
        >
          {rankings.entries.map((entry) => (
            <button
              key={entry.team.id}
              type="button"
              aria-pressed={entry.team.id === focused?.team.id}
              aria-label={`Follow ${entry.team.name ?? entry.team.abbr ?? "Team"}, currently rank ${entry.rank}`}
              title={`${entry.rank}. ${entry.team.name ?? entry.team.abbr ?? "Team"}`}
              onClick={() => selectTeam(entry.team.id)}
              className={`flex h-8 items-center gap-1 rounded px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${entry.team.id === focused?.team.id ? "bg-slate-100 ring-1 ring-slate-400" : "opacity-50 hover:opacity-100"}`}
            >
              <span className="w-4 text-right text-xs tabular-nums">
                {entry.rank}
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded border border-slate-100 bg-slate-50">
                {entry.team.logoUrl ? (
                  <Image
                    src={entry.team.logoUrl}
                    alt=""
                    width={24}
                    height={24}
                    className="h-6 w-6 object-contain"
                  />
                ) : (
                  <span className="text-[9px] font-semibold">
                    {entry.team.abbr ?? "TM"}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Ranks show each team entering the week, with #1 at the top. Future weeks
        remain blank.
      </p>
      {!chartData.some((point) => "weekId" in point) && (
        <p className="mt-2 text-sm text-slate-500">
          Weekly journeys appear once regular-season snapshots are available.
        </p>
      )}
    </section>
  );
}
