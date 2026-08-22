"use client";

import Image from "next/image";
import { Info, Swords } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@gshl-components/ui";
import { ConferenceContestSkeleton } from "@gshl-skeletons";
import {
  useAppRouter,
  useConferenceContestData,
  useSeasonState,
} from "@gshl-hooks";
import type {
  ConferenceContestConferenceInfo,
  ConferenceContestBrowserSeason,
  ConferenceContestRawStatRow,
} from "@gshl-types";
import { buildStandingsNavigationHref, cn } from "@gshl-utils";

const cleanConferenceName = (name: string) => name.replace(" Hotel", "");

const conferenceTone = (conference: ConferenceContestConferenceInfo) => {
  const value = `${conference.name} ${conference.abbr ?? ""}`.toLowerCase();
  return value.includes("sunview") || value.includes("sv")
    ? { line: "#3b82f6", text: "text-sunview-800" }
    : { line: "#ef4444", text: "text-hotel-800" };
};

function ConferenceLogo({
  conference,
  size = 52,
  decorative = false,
}: {
  conference: ConferenceContestConferenceInfo;
  size?: number;
  decorative?: boolean;
}) {
  if (!conference.logoUrl) {
    return (
      <div
        aria-hidden={decorative}
        className="flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 font-oswald text-base font-semibold text-slate-500"
        style={{ width: size, height: size }}
      >
        {conference.abbr ?? conference.name.slice(0, 2)}
      </div>
    );
  }

  return (
    <div
      aria-hidden={decorative}
      className="flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5"
    >
      <Image
        src={conference.logoUrl}
        alt={decorative ? "" : `${conference.name} logo`}
        width={size}
        height={size}
        className="object-contain"
      />
    </div>
  );
}

function ConferenceHeader({
  left,
  right,
}: {
  left: ConferenceContestConferenceInfo;
  right: ConferenceContestConferenceInfo;
}) {
  return (
    <section
      aria-label="Conference matchup"
      className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-4 sm:gap-8 sm:px-8 sm:py-6"
    >
      {[left, right].map((conference, index) => (
        <div
          key={conference.id}
          className={cn(
            "row-start-1 flex min-w-0 justify-center",
            index === 0 ? "col-start-1" : "col-start-3",
          )}
        >
          <span className="sr-only">
            {cleanConferenceName(conference.name)} conference
          </span>
          <ConferenceLogo conference={conference} size={96} decorative />
        </div>
      ))}
      <span className="col-start-2 row-start-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-300 sm:text-[10px]">
        vs
      </span>
    </section>
  );
}

function RawStatsTable({
  title,
  left,
  right,
  rows,
}: {
  title: string;
  left: ConferenceContestConferenceInfo;
  right: ConferenceContestConferenceInfo;
  rows: ConferenceContestRawStatRow[];
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-3 sm:px-5 sm:py-4">
        <h2 className="font-oswald text-xl text-slate-950 sm:text-2xl">
          {title}
        </h2>
      </div>
      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">
          {title} comparison for {cleanConferenceName(left.name)} and{" "}
          {cleanConferenceName(right.name)}
        </caption>
        <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
          <tr>
            <th
              scope="col"
              className="w-[25%] px-2 py-2 text-center sm:px-5 sm:py-3"
            >
              <span className="sr-only">
                {cleanConferenceName(left.name)} conference
              </span>
              <ConferenceLogo conference={left} size={32} decorative />
            </th>
            <th
              scope="col"
              className="w-[50%] px-1.5 py-2 text-center text-[9px] font-medium sm:px-2 sm:py-3 sm:text-[10px]"
            >
              Stat
            </th>
            <th
              scope="col"
              className="w-[25%] px-2 py-2 text-center sm:px-5 sm:py-3"
            >
              <span className="sr-only">
                {cleanConferenceName(right.name)} conference
              </span>
              <ConferenceLogo conference={right} size={32} decorative />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.label} className="hover:bg-slate-50/70">
              <td
                className={cn(
                  "px-2 py-2.5 text-center font-oswald text-lg tabular-nums sm:px-5 sm:py-3 sm:text-xl",
                  conferenceTone(left).text,
                )}
              >
                {row.left}
              </td>
              <th
                scope="row"
                className="px-1.5 py-2.5 text-center text-[11px] font-medium leading-tight text-slate-600 sm:px-2 sm:py-3 sm:text-xs"
              >
                {row.label}
              </th>
              <td
                className={cn(
                  "px-2 py-2.5 text-center font-oswald text-lg tabular-nums sm:px-5 sm:py-3 sm:text-xl",
                  conferenceTone(right).text,
                )}
              >
                {row.right}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function RatingTrend({
  seasons,
  left,
  right,
}: {
  seasons: ConferenceContestBrowserSeason[];
  left: ConferenceContestConferenceInfo;
  right: ConferenceContestConferenceInfo;
}) {
  const leftTone = conferenceTone(left);
  const rightTone = conferenceTone(right);
  const data = [...seasons].reverse().map((season) => ({
    year: season.seasonYear,
    left: Number((season.ratingByConferenceId[left.id] ?? 50).toFixed(1)),
    right: Number((season.ratingByConferenceId[right.id] ?? 50).toFixed(1)),
  }));

  return (
    <section
      aria-label="Conference rating trend"
      className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5"
    >
      <div>
        <h2 className="font-oswald text-xl text-slate-950 sm:text-2xl">
          Ratings
        </h2>
      </div>
      <div
        className="mt-5 h-72 w-full"
        aria-label="Conference rating history chart"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 10, right: 10, left: -22, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="4 4"
              stroke="#e2e8f0"
              vertical={false}
            />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tick={{ fontSize: 11 }}
              stroke="#94a3b8"
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                value.toFixed(1),
                name,
              ]}
              contentStyle={{
                borderRadius: 8,
                borderColor: "#e2e8f0",
                boxShadow: "0 8px 20px rgba(15,23,42,.08)",
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="left"
              name={left.abbr ?? "Left"}
              stroke={leftTone.line}
              strokeWidth={3}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="right"
              name={right.abbr ?? "Right"}
              stroke={rightTone.line}
              strokeWidth={3}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function SeasonExplorer({
  selectedSeason,
}: {
  selectedSeason: ConferenceContestBrowserSeason;
}) {
  const { router } = useAppRouter();
  const left = selectedSeason.leftConference;
  const right = selectedSeason.rightConference;
  const leftId = left.id;
  const rightId = right.id;
  const rows: ConferenceContestRawStatRow[] = [
    {
      label: "Head-to-head wins",
      left: selectedSeason.headToHeadWinsByConferenceId[leftId] ?? 0,
      right: selectedSeason.headToHeadWinsByConferenceId[rightId] ?? 0,
    },
    {
      label: "Playoff wins",
      left: selectedSeason.playoffWinsByConferenceId[leftId] ?? 0,
      right: selectedSeason.playoffWinsByConferenceId[rightId] ?? 0,
    },
    {
      label: "Playoff teams",
      left: selectedSeason.playoffTeamsByConferenceId[leftId] ?? 0,
      right: selectedSeason.playoffTeamsByConferenceId[rightId] ?? 0,
    },
    {
      label: "Finalists",
      left: selectedSeason.finalistsByConferenceId[leftId] ?? 0,
      right: selectedSeason.finalistsByConferenceId[rightId] ?? 0,
    },
    {
      label: "GSHL Cups",
      left: selectedSeason.championsByConferenceId[leftId] ?? 0,
      right: selectedSeason.championsByConferenceId[rightId] ?? 0,
    },
    {
      label: "League awards",
      left: selectedSeason.awardsByConferenceId[leftId] ?? 0,
      right: selectedSeason.awardsByConferenceId[rightId] ?? 0,
    },
  ];

  return (
    <section aria-label={`${selectedSeason.seasonName} conference results`}>
      <RawStatsTable
        title={selectedSeason.seasonName}
        left={left}
        right={right}
        rows={rows}
      />

      <div className="mt-3 flex justify-end">
        <Button
          variant="outline"
          onClick={() => {
            router.push(
              buildStandingsNavigationHref("", {
                view: "overall",
                season: selectedSeason.seasonId,
              }),
            );
          }}
          className="h-8 rounded-md px-3 text-[11px] sm:h-9 sm:px-4 sm:text-xs"
        >
          Standings
        </Button>
      </div>
    </section>
  );
}

export function ConferenceContest() {
  const { overall, seasons, isLoading, error } = useConferenceContestData();
  const { selectedSeason: globalSeason, isLoading: seasonLoading } =
    useSeasonState();
  const selectedSeason = seasons.find(
    (season) => season.seasonId === String(globalSeason?.id ?? ""),
  );

  if (isLoading || seasonLoading) return <ConferenceContestSkeleton />;

  if (error) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50 p-8 text-center">
        <Info className="mx-auto h-7 w-7 text-red-500" aria-hidden="true" />
        <h2 className="mt-3 font-oswald text-2xl text-red-950">Unavailable</h2>
        <p className="mt-2 text-sm text-red-700">Try again shortly.</p>
      </div>
    );
  }

  if (!overall || !selectedSeason) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-8 text-center">
        <Swords className="mx-auto h-7 w-7 text-slate-400" aria-hidden="true" />
        <h2 className="mt-3 font-oswald text-2xl text-slate-900">No data</h2>
        <p className="mt-2 text-sm text-slate-500">
          No conference data is available for this season.
        </p>
      </div>
    );
  }

  const left = overall.leftConference;
  const right = overall.rightConference;
  const allTimeRows: ConferenceContestRawStatRow[] = [
    {
      label: "Head-to-head wins",
      left: overall.headToHeadWinsByConferenceId[left.id] ?? 0,
      right: overall.headToHeadWinsByConferenceId[right.id] ?? 0,
    },
    {
      label: "Playoff wins",
      left: overall.playoffWinsByConferenceId[left.id] ?? 0,
      right: overall.playoffWinsByConferenceId[right.id] ?? 0,
    },
    {
      label: "Playoff berths",
      left: overall.playoffTeamsByConferenceId[left.id] ?? 0,
      right: overall.playoffTeamsByConferenceId[right.id] ?? 0,
    },
    {
      label: "Finals appearances",
      left: overall.finalistsByConferenceId[left.id] ?? 0,
      right: overall.finalistsByConferenceId[right.id] ?? 0,
    },
    {
      label: "GSHL Cups",
      left: overall.championsByConferenceId[left.id] ?? 0,
      right: overall.championsByConferenceId[right.id] ?? 0,
    },
    {
      label: "League awards",
      left: overall.awardsByConferenceId[left.id] ?? 0,
      right: overall.awardsByConferenceId[right.id] ?? 0,
    },
    {
      label: "Coach of the Year",
      left: overall.coachAwardsByConferenceId[left.id] ?? 0,
      right: overall.coachAwardsByConferenceId[right.id] ?? 0,
    },
    {
      label: "GM of the Year",
      left: overall.gmAwardsByConferenceId[left.id] ?? 0,
      right: overall.gmAwardsByConferenceId[right.id] ?? 0,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-8">
      <ConferenceHeader left={left} right={right} />

      <RawStatsTable
        title="All-time"
        left={left}
        right={right}
        rows={allTimeRows}
      />

      <RatingTrend seasons={seasons} left={left} right={right} />

      <SeasonExplorer selectedSeason={selectedSeason} />
    </div>
  );
}
