"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { CalendarDays, ChevronDown, Info, Swords } from "lucide-react";
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
  useSeasonNavigation,
} from "@gshl-hooks";
import type {
  ConferenceContestConferenceInfo,
  ConferenceContestRawStatRow,
  ConferenceContestRecord,
  ConferenceContestSeasonViewModel,
} from "@gshl-types";
import { cn } from "@gshl-utils";

const cleanConferenceName = (name: string) => name.replace(" Hotel", "");

const conferenceTone = (conference: ConferenceContestConferenceInfo) => {
  const value = `${conference.name} ${conference.abbr ?? ""}`.toLowerCase();
  return value.includes("sunview") || value.includes("sv")
    ? { line: "#3b82f6", text: "text-sunview-800" }
    : { line: "#ef4444", text: "text-hotel-800" };
};

const recordLabel = (record?: ConferenceContestRecord) => {
  const value = record ?? { wins: 0, losses: 0, ties: 0 };
  return `${value.wins}-${value.losses}${value.ties ? `-${value.ties}` : ""}`;
};

function ConferenceLogo({
  conference,
  size = 52,
}: {
  conference: ConferenceContestConferenceInfo;
  size?: number;
}) {
  if (!conference.logoUrl) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 font-oswald text-sm font-semibold text-slate-500"
        style={{ width: size, height: size }}
      >
        {conference.abbr ?? conference.name.slice(0, 2)}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5">
      <Image
        src={conference.logoUrl}
        alt={`${conference.name} logo`}
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
    <section className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-5 sm:gap-8 sm:px-8">
      {[left, right].map((conference, index) => (
        <div
          key={conference.id}
          className={cn(
            "row-start-1 flex min-w-0 items-center gap-3",
            index === 0
              ? "col-start-1"
              : "col-start-3 flex-row-reverse text-right",
          )}
        >
          <ConferenceLogo conference={conference} />
          <div className="min-w-0">
            <p className="truncate font-oswald text-xl uppercase text-slate-950 sm:text-2xl">
              {cleanConferenceName(conference.name)}
            </p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
              {conference.abbr ?? "Conference"}
            </p>
          </div>
        </div>
      ))}
      <span className="col-start-2 row-start-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
        vs
      </span>
    </section>
  );
}

function RawStatsTable({
  title,
  description,
  left,
  right,
  rows,
}: {
  title: string;
  description?: string;
  left: ConferenceContestConferenceInfo;
  right: ConferenceContestConferenceInfo;
  rows: ConferenceContestRawStatRow[];
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
        <h2 className="font-oswald text-2xl text-slate-950">{title}</h2>
        {description ? (
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        ) : null}
      </div>
      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">
          {title} comparison for {cleanConferenceName(left.name)} and{" "}
          {cleanConferenceName(right.name)}
        </caption>
        <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
          <tr>
            <th scope="col" className="w-[28%] px-3 py-3 text-center sm:px-5">
              {left.abbr ?? cleanConferenceName(left.name)}
            </th>
            <th
              scope="col"
              className="w-[44%] px-2 py-3 text-center font-medium"
            >
              Stat
            </th>
            <th scope="col" className="w-[28%] px-3 py-3 text-center sm:px-5">
              {right.abbr ?? cleanConferenceName(right.name)}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.label} className="hover:bg-slate-50/70">
              <td
                className={cn(
                  "px-3 py-3 text-center font-oswald text-xl tabular-nums sm:px-5",
                  conferenceTone(left).text,
                )}
              >
                {row.left}
              </td>
              <th
                scope="row"
                className="px-2 py-3 text-center text-xs font-medium text-slate-600"
              >
                {row.label}
              </th>
              <td
                className={cn(
                  "px-3 py-3 text-center font-oswald text-xl tabular-nums sm:px-5",
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
  seasons: ConferenceContestSeasonViewModel[];
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
    <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
            Season by season
          </p>
          <h2 className="mt-1 font-oswald text-2xl text-slate-950">
            The balance of power
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            The adjusted conference rating is shown here only, so the trend is
            easy to follow over time.
          </p>
        </div>
        <CalendarDays
          className="mt-1 hidden h-5 w-5 text-slate-400 sm:block"
          aria-hidden="true"
        />
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
              name={cleanConferenceName(left.name)}
              stroke={leftTone.line}
              strokeWidth={3}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="right"
              name={cleanConferenceName(right.name)}
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
  seasons,
  selectedSeason,
  onSelect,
}: {
  seasons: ConferenceContestSeasonViewModel[];
  selectedSeason: ConferenceContestSeasonViewModel;
  onSelect: (seasonId: string) => void;
}) {
  const router = useAppRouter();
  const { setSelectedSeasonId } = useSeasonNavigation();
  const left = selectedSeason.leftConference;
  const right = selectedSeason.rightConference;
  const leftId = left.id;
  const rightId = right.id;
  const rows: ConferenceContestRawStatRow[] = [
    {
      label: "Head-to-head record",
      left: recordLabel(selectedSeason.headToHeadRecordByConferenceId[leftId]),
      right: recordLabel(
        selectedSeason.headToHeadRecordByConferenceId[rightId],
      ),
    },
    {
      label: "Playoff record",
      left: recordLabel(selectedSeason.playoffRecordByConferenceId[leftId]),
      right: recordLabel(selectedSeason.playoffRecordByConferenceId[rightId]),
    },
    {
      label: "Playoff teams",
      left: selectedSeason.playoffTeamsByConferenceId[leftId]?.length ?? 0,
      right: selectedSeason.playoffTeamsByConferenceId[rightId]?.length ?? 0,
    },
    {
      label: "Finalists",
      left: selectedSeason.finalsTeamsByConferenceId[leftId]?.length ?? 0,
      right: selectedSeason.finalsTeamsByConferenceId[rightId]?.length ?? 0,
    },
    {
      label: "GSHL Cups",
      left: selectedSeason.championTeamsByConferenceId[leftId]?.length ?? 0,
      right: selectedSeason.championTeamsByConferenceId[rightId]?.length ?? 0,
    },
    {
      label: "League awards",
      left: selectedSeason.awardsByConferenceId[leftId]?.length ?? 0,
      right: selectedSeason.awardsByConferenceId[rightId]?.length ?? 0,
    },
  ];

  return (
    <section>
      <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
            Season detail
          </p>
          <h2 className="mt-1 font-oswald text-2xl text-slate-950">
            Raw season totals
          </h2>
        </div>
        <label className="relative block">
          <span className="sr-only">Choose a season</span>
          <select
            value={selectedSeason.seasonId}
            onChange={(event) => onSelect(event.target.value)}
            className="h-10 w-full appearance-none rounded-md border border-slate-200 bg-white py-2 pl-3 pr-9 font-oswald text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 sm:w-52"
          >
            {seasons.map((season) => (
              <option key={season.seasonId} value={season.seasonId}>
                {season.seasonName}
                {season.isActive ? " · Live" : ""}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400"
            aria-hidden="true"
          />
        </label>
      </div>

      <RawStatsTable
        title={selectedSeason.seasonName}
        description="Recorded results and counts, with no weighting or ratio adjustment."
        left={left}
        right={right}
        rows={rows}
      />

      <div className="mt-3 flex justify-end">
        <Button
          variant="outline"
          onClick={() => {
            setSelectedSeasonId(selectedSeason.seasonId);
            router.push("/standings");
          }}
          className="h-9 rounded-md px-4 text-xs"
        >
          View {selectedSeason.seasonName} standings
        </Button>
      </div>
    </section>
  );
}

export function ConferenceContest() {
  const { overall, seasons, isLoading, error } = useConferenceContestData();
  const [selectedSeasonId, setSelectedSeasonId] = useState("");

  useEffect(() => {
    if (
      seasons.length &&
      !seasons.some((season) => season.seasonId === selectedSeasonId)
    ) {
      setSelectedSeasonId(seasons[0]?.seasonId ?? "");
    }
  }, [seasons, selectedSeasonId]);

  const selectedSeason =
    seasons.find((season) => season.seasonId === selectedSeasonId) ??
    seasons[0];

  if (isLoading) return <ConferenceContestSkeleton />;

  if (error) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50 p-8 text-center">
        <Info className="mx-auto h-7 w-7 text-red-500" aria-hidden="true" />
        <h1 className="mt-3 font-oswald text-2xl text-red-950">
          Conference comparison is unavailable
        </h1>
        <p className="mt-2 text-sm text-red-700">
          The historical results could not be loaded. Please try again shortly.
        </p>
      </div>
    );
  }

  if (!overall || !selectedSeason) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-8 text-center">
        <Swords className="mx-auto h-7 w-7 text-slate-400" aria-hidden="true" />
        <h1 className="mt-3 font-oswald text-2xl text-slate-900">
          No conference comparison yet
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Two conferences and at least one season are needed to compare results.
        </p>
      </div>
    );
  }

  const left = overall.leftConference;
  const right = overall.rightConference;
  const allTimeRows: ConferenceContestRawStatRow[] = [
    {
      label: "Head-to-head record",
      left: recordLabel(overall.headToHeadRecordByConferenceId[left.id]),
      right: recordLabel(overall.headToHeadRecordByConferenceId[right.id]),
    },
    {
      label: "Playoff record",
      left: recordLabel(overall.playoffRecordByConferenceId[left.id]),
      right: recordLabel(overall.playoffRecordByConferenceId[right.id]),
    },
    {
      label: "Playoff berths",
      left: overall.playoffTeamsByConferenceId[left.id]?.length ?? 0,
      right: overall.playoffTeamsByConferenceId[right.id]?.length ?? 0,
    },
    {
      label: "Finals appearances",
      left: overall.finalsTeamsByConferenceId[left.id]?.length ?? 0,
      right: overall.finalsTeamsByConferenceId[right.id]?.length ?? 0,
    },
    {
      label: "GSHL Cups",
      left: overall.championTeamsByConferenceId[left.id]?.length ?? 0,
      right: overall.championTeamsByConferenceId[right.id]?.length ?? 0,
    },
    {
      label: "League awards",
      left: overall.awardsByConferenceId[left.id]?.length ?? 0,
      right: overall.awardsByConferenceId[right.id]?.length ?? 0,
    },
    {
      label: "Coach of the Year",
      left: overall.coachAwardsByConferenceId[left.id]?.length ?? 0,
      right: overall.coachAwardsByConferenceId[right.id]?.length ?? 0,
    },
    {
      label: "GM of the Year",
      left: overall.gmAwardsByConferenceId[left.id]?.length ?? 0,
      right: overall.gmAwardsByConferenceId[right.id]?.length ?? 0,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-8">
      <header className="border-b border-slate-200 pb-4">
        <p className="font-barlow text-[10px] uppercase tracking-[0.22em] text-slate-400">
          League Office
        </p>
        <h1 className="mt-1 font-oswald text-4xl uppercase leading-none text-slate-950">
          Conference vs Conference
        </h1>
        <p className="mt-2 text-xs text-slate-500">
          A direct comparison of recorded results across GSHL history.
        </p>
      </header>

      <ConferenceHeader left={left} right={right} />

      <RawStatsTable
        title="All-time totals"
        description="Raw records and counts. No category points, weights, or ratio-adjusted scores."
        left={left}
        right={right}
        rows={allTimeRows}
      />

      <RatingTrend seasons={seasons} left={left} right={right} />

      <SeasonExplorer
        seasons={seasons}
        selectedSeason={selectedSeason}
        onSelect={setSelectedSeasonId}
      />
    </div>
  );
}
