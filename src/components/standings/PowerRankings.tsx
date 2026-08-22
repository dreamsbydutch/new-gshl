"use client";

import { useMemo } from "react";
import Image from "next/image";
import { ArrowDown, ArrowUp, ChevronDown, Minus } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  PowerRankingEntry,
  PowerRankingsProps,
  PowerRankingsViewModel,
} from "@gshl-types";
import { useAuthSession, useDistinctTeamColors } from "@gshl-hooks";
import { TableViewport } from "@gshl-ui";
import { WhatsAppShareButton } from "@gshl-components/ui/WhatsAppShareButton";
import { buildStandingsNavigationHref } from "@gshl-utils";
import {
  buildWhatsAppShareMessage,
  canShareCommissionerContent,
} from "@gshl-utils/features/whatsapp-share";

function RankMovement({ entry }: { entry: PowerRankingEntry }) {
  if (entry.rankChange === null) {
    return (
      <span className="text-xs text-slate-500" aria-label="No prior ranking">
        First rank
      </span>
    );
  }
  if (entry.rankChange > 0) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-700"
        aria-label={`Up ${entry.rankChange} ${entry.rankChange === 1 ? "place" : "places"}`}
      >
        <ArrowUp className="h-3 w-3" aria-hidden="true" />
        {entry.rankChange}
      </span>
    );
  }
  if (entry.rankChange < 0) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-700"
        aria-label={`Down ${Math.abs(entry.rankChange)} ${Math.abs(entry.rankChange) === 1 ? "place" : "places"}`}
      >
        <ArrowDown className="h-3 w-3" aria-hidden="true" />
        {Math.abs(entry.rankChange)}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs text-slate-500"
      aria-label="No rank movement"
    >
      <Minus className="h-3 w-3" aria-hidden="true" />
      Even
    </span>
  );
}

function CurrentRanking({
  entries,
  seasonName,
  snapshotLabel,
}: {
  entries: PowerRankingEntry[];
  seasonName: string;
  snapshotLabel: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-2">
        <h2 className="font-oswald text-xl text-slate-950 sm:text-2xl">
          {snapshotLabel} ranking
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Movement compares the two most recent ranked weeks.
        </p>
      </div>

      <ol
        className="divide-y divide-slate-100 md:hidden"
        aria-label={`${snapshotLabel} team power rankings for ${seasonName}`}
      >
        {entries.map((entry) => (
          <li key={entry.team.id} className="p-2.5">
            <article className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 gap-y-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 font-oswald text-lg font-semibold tabular-nums text-white">
                <span className="sr-only">Rank </span>
                {entry.rank}
              </div>
              <div className="flex min-w-0 items-center gap-2.5">
                <TeamLogo entry={entry} />
                <h3 className="min-w-0 break-words text-sm font-semibold leading-5 text-slate-950">
                  {entry.team.name ?? entry.team.abbr ?? "Team"}
                </h3>
              </div>
              <dl className="col-span-2 grid grid-cols-2 border-t border-slate-100">
                <div className="px-3 py-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Movement
                  </dt>
                  <dd className="mt-0.5">
                    <RankMovement entry={entry} />
                  </dd>
                </div>
                <div className="border-l border-slate-200 px-3 py-2 text-right">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Rating
                  </dt>
                  <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-800">
                    {entry.rating === null ? "—" : entry.rating.toFixed(1)}
                  </dd>
                </div>
              </dl>
            </article>
          </li>
        ))}
      </ol>

      <TableViewport
        ariaLabel={`${snapshotLabel} team power rankings for ${seasonName}`}
        className="hidden md:block"
        viewportClassName="rounded-none border-0 focus-visible:ring-inset focus-visible:ring-offset-0"
      >
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <caption className="sr-only">
            {snapshotLabel} team power rankings for {seasonName}
          </caption>
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-[0.14em] text-slate-500">
            <tr>
              <th scope="col" className="w-16 px-3 py-2.5 text-center">
                Rank
              </th>
              <th scope="col" className="px-3 py-2.5 text-left">
                Team
              </th>
              <th scope="col" className="w-24 px-3 py-2.5 text-center">
                Movement
              </th>
              <th scope="col" className="w-24 px-3 py-2.5 text-right">
                Rating
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map((entry) => (
              <tr
                key={entry.team.id}
                className="transition-colors hover:bg-slate-50"
              >
                <td className="px-3 py-2.5 text-center font-oswald text-lg font-semibold tabular-nums text-slate-950">
                  {entry.rank}
                </td>
                <th scope="row" className="px-3 py-2.5 text-left font-normal">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <TeamLogo entry={entry} />
                    <span className="min-w-0 font-semibold text-slate-900">
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
      </TableViewport>
    </section>
  );
}

function RankingHistoryData({
  rankings,
  seasonName,
  signedInTeamId,
}: {
  rankings: PowerRankingsViewModel;
  seasonName: string;
  signedInTeamId: string | null;
}) {
  return (
    <details className="group mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-slate-700 marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 [&::-webkit-details-marker]:hidden">
        Weekly ranking data
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <TableViewport
        ariaLabel={`Weekly power-ranking data for ${seasonName}`}
        scrollHint="Scroll to compare every team"
        viewportClassName="rounded-none border-x-0 border-b-0 focus-visible:ring-inset focus-visible:ring-offset-0"
      >
        <table className="w-max min-w-full border-collapse text-xs">
          <caption className="sr-only">
            Exact weekly power-ranking positions for {seasonName}
          </caption>
          <thead className="border-y border-slate-200 bg-white text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-white px-3 py-2.5 text-left"
              >
                Week
              </th>
              {rankings.series.map((team) => (
                <th
                  key={team.teamId}
                  scope="col"
                  className="min-w-28 px-3 py-2.5 text-center"
                >
                  {team.name}
                  {team.teamId === signedInTeamId ? (
                    <span className="sr-only"> (your team)</span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {rankings.chartData.map((point) => (
              <tr key={point.weekId}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2.5 text-left font-semibold text-slate-700"
                >
                  {point.label}
                </th>
                {rankings.series.map((team) => {
                  const value = point[team.teamId];
                  return (
                    <td
                      key={`${point.weekId}-${team.teamId}`}
                      className="px-3 py-2.5 text-center font-mono font-semibold tabular-nums text-slate-800"
                    >
                      {typeof value === "number" ? `#${value}` : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </TableViewport>
    </details>
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
      <div className="border-y border-dashed py-6 text-center text-sm text-slate-500">
        Select a season to view its power rankings.
      </div>
    );
  }

  const snapshotLabel = season.isActive ? "Current" : "Final";
  const latestWeekLabel = rankings.latestWeek
    ? `through Week ${rankings.latestWeek.weekNum}`
    : "from the season summary";
  const shareMessage = buildWhatsAppShareMessage({
    title: `GSHL ${snapshotLabel} Power Rankings`,
    summary: `${season.name} · ${latestWeekLabel}`,
    lines: rankings.entries.map((entry) => {
      const teamName = entry.team.name ?? entry.team.abbr ?? "Team";
      const movement =
        entry.rankChange === null || entry.rankChange === 0
          ? ""
          : entry.rankChange > 0
            ? ` (up ${entry.rankChange})`
            : ` (down ${Math.abs(entry.rankChange)})`;
      const rating =
        entry.rating === null ? "" : ` · ${entry.rating.toFixed(1)}`;
      return `${entry.rank}. ${teamName}${rating}${movement}`;
    }),
  });
  const sharePath = buildStandingsNavigationHref("", {
    view: "power",
    season: String(season.id),
  });
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
    <div className="mx-auto w-full max-w-6xl space-y-3 px-2.5 py-3 sm:px-6 sm:py-4">
      <header className="border-b border-slate-300 pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-oswald text-2xl text-slate-950 sm:text-3xl">
              {season.name} power rankings
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {snapshotLabel} order {latestWeekLabel}.
            </p>
          </div>
          {canShareCommissionerContent(session?.user.role) ? (
            <WhatsAppShareButton
              message={shareMessage}
              path={sharePath}
              label="Share rankings"
              disabled={rankings.entries.length === 0}
            />
          ) : null}
        </div>
      </header>

      {!rankings.entries.length ? (
        <section className="border-y border-dashed border-slate-300 py-6 text-center">
          <h2 className="font-oswald text-xl text-slate-900">
            No power rankings available
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            No ranking snapshot exists for this season.
          </p>
        </section>
      ) : (
        <>
          <CurrentRanking
            entries={rankings.entries}
            seasonName={season.name}
            snapshotLabel={snapshotLabel}
          />

          <section className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
            <div>
              <h2 className="font-oswald text-xl text-slate-950 sm:text-2xl">
                Ranking history
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Rank 1 is at the top. Weekly data is available below.
                {signedInTeamId
                  ? " Your team is shown with a thicker line."
                  : ""}
              </p>
            </div>
            {rankings.chartData.length ? (
              <div className="mt-4 h-72 w-full sm:h-[28rem]" aria-hidden="true">
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
              <p className="mt-4 border-y border-slate-200 py-4 text-center text-sm text-slate-500">
                Weekly ranking history is not available for this season.
              </p>
            )}
            {rankings.chartData.length ? (
              <RankingHistoryData
                rankings={rankings}
                seasonName={season.name}
                signedInTeamId={signedInTeamId}
              />
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
