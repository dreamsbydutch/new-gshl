"use client";

import Image from "next/image";
import { ArrowDown, ArrowUp, Minus, Shield, Users } from "lucide-react";

import { Skeleton } from "@gshl-components/ui/SkeletonPrimitive";
import { useOwnerRankingsData } from "@gshl-hooks";
import { AWARD_CATALOG_BY_KEY } from "@gshl-lib/config/awards";
import type {
  AwardsList as AwardsListType,
  OwnerRankingEntry,
  OwnerRankingRecord,
} from "@gshl-types";
import { AwardsList, cn } from "@gshl-utils";

const formatRating = (value: number) => Math.round(value).toLocaleString();
const formatSigned = (value: number) =>
  `${value > 0 ? "+" : ""}${Math.round(value).toLocaleString()}`;
const formatPercentage = (value: number) => `${(value * 100).toFixed(1)}%`;
const recordLabel = (record: OwnerRankingRecord) =>
  `${record.wins}-${record.losses}${record.ties ? `-${record.ties}` : ""}`;

function OwnerMark({ entry }: { entry: OwnerRankingEntry }) {
  if (entry.primaryTeam?.logoUrl) {
    return (
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white p-0.5 sm:h-8 sm:w-8 sm:p-1">
        <Image
          src={entry.primaryTeam.logoUrl}
          alt=""
          width={20}
          height={20}
          className="max-h-5 max-w-5 object-contain sm:max-h-6 sm:max-w-6"
        />
      </div>
    );
  }

  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 font-oswald text-[10px] text-slate-500 sm:h-8 sm:w-8 sm:text-xs">
      {entry.displayName.slice(0, 2).toUpperCase()}
    </div>
  );
}

function Movement({ entry }: { entry: OwnerRankingEntry }) {
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
  return <Minus className="h-3 w-3 text-slate-300" aria-label="No movement" />;
}

function RecordCell({ record }: { record: OwnerRankingRecord }) {
  return (
    <div className="whitespace-nowrap tabular-nums">
      <div className="text-[11px] font-medium text-slate-700 sm:text-xs">
        {recordLabel(record)}
      </div>
      <div className="text-[10px] text-slate-400">
        {formatPercentage(record.winPercentage)}
      </div>
    </div>
  );
}

function SignedCell({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        value > 0
          ? "text-emerald-700"
          : value < 0
            ? "text-red-600"
            : "text-slate-400",
      )}
    >
      {formatSigned(value)}
    </span>
  );
}

function AwardMark({
  award,
  label,
  size = 18,
}: {
  award: AwardsListType;
  label: string;
  size?: number;
}) {
  const imageUrl = AWARD_CATALOG_BY_KEY.get(award)?.imageUrl;
  return imageUrl ? (
    <Image
      src={imageUrl}
      alt=""
      width={size}
      height={size}
      className="h-3.5 w-3.5 shrink-0 object-contain sm:h-[18px] sm:w-[18px]"
      title={label}
    />
  ) : null;
}

function AwardMarks({
  award,
  count,
  label,
  negative = false,
}: {
  award: AwardsListType;
  count: number;
  label: string;
  negative?: boolean;
}) {
  if (!count) return <span className="text-slate-300">—</span>;

  return (
    <div
      className={cn(
        "flex min-w-8 flex-wrap justify-center gap-0.5 sm:min-w-10",
        negative && "rounded bg-red-50 px-1 py-0.5",
      )}
      aria-label={`${count} ${label}${count === 1 ? "" : "s"}`}
      title={`${count} ${label}${count === 1 ? "" : "s"}`}
    >
      {Array.from({ length: count }, (_, index) => (
        <AwardMark
          key={`${award}-${index}`}
          award={award}
          label={label}
          size={18}
        />
      ))}
    </div>
  );
}

function AwardHeading({
  award,
  label,
}: {
  award: AwardsListType;
  label: string;
}) {
  return (
    <div
      className="flex items-center justify-center gap-1 sm:gap-1.5"
      title={label}
    >
      <AwardMark award={award} label={label} size={20} />
      <span>{label}</span>
    </div>
  );
}

function OwnerRankingsSkeleton() {
  return (
    <div className="mx-auto max-w-[100rem] space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-52" />
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <Skeleton className="h-[38rem] rounded-lg" />
    </div>
  );
}

export function OwnerRankings() {
  const { data, isLoading, error } = useOwnerRankingsData();

  if (isLoading) return <OwnerRankingsSkeleton />;

  if (error) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50 p-8 text-center">
        <Shield className="mx-auto h-6 w-6 text-red-500" />
        <h1 className="mt-3 font-oswald text-2xl text-red-950">
          The GM Ladder is unavailable
        </h1>
        <p className="mt-1 text-sm text-red-700">
          The league history could not be assembled right now.
        </p>
      </div>
    );
  }

  if (!data.rankings.length) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-8 text-center">
        <Users className="mx-auto h-6 w-6 text-slate-400" />
        <h1 className="mt-3 font-oswald text-2xl text-slate-900">
          No GMs are on the ladder yet
        </h1>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[100rem] pb-8">
      <header className="border-b border-slate-200 pb-4">
        <div>
          <p className="font-barlow text-[10px] uppercase tracking-[0.22em] text-slate-400">
            League Office
          </p>
          <h1 className="mt-1 font-oswald text-3xl uppercase leading-none text-slate-950 sm:text-4xl">
            GM Ladder
          </h1>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500 sm:text-xs">
            Career results, playoff performance, and legacy lead the rating;
            matchup Elo contributes a small form adjustment. New GMs start at
            250.
          </p>
        </div>
      </header>

      <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white sm:mt-4">
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-[11px] sm:min-w-[1160px] sm:text-xs">
            <caption className="sr-only">
              All-time GM ladder with records, playoff results, and awards
            </caption>
            <thead className="border-b border-slate-200 bg-slate-50 text-[9px] uppercase tracking-[0.11em] text-slate-500 sm:text-[10px]">
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-30 w-12 min-w-12 bg-slate-50 px-1.5 py-2 text-center shadow-[1px_0_0_0_rgb(226_232_240)] sm:static sm:z-auto sm:w-16 sm:px-3 sm:py-3 sm:shadow-none"
                >
                  Rank
                </th>
                <th
                  scope="col"
                  className="sticky left-12 z-30 w-40 min-w-40 bg-slate-50 px-2 py-2 shadow-[1px_0_0_0_rgb(226_232_240)] sm:static sm:z-auto sm:w-auto sm:min-w-56 sm:px-3 sm:py-3 sm:shadow-none"
                >
                  GM
                </th>
                <th
                  scope="col"
                  className="px-2 py-2 text-right sm:px-3 sm:py-3"
                >
                  Rating
                </th>
                <th
                  scope="col"
                  className="px-2 py-2 text-right sm:px-3 sm:py-3"
                >
                  Last
                </th>
                <th scope="col" className="px-2 py-2 sm:px-3 sm:py-3">
                  Overall
                </th>
                <th scope="col" className="px-2 py-2 sm:px-3 sm:py-3">
                  Conference
                </th>
                <th scope="col" className="px-2 py-2 sm:px-3 sm:py-3">
                  Playoffs
                </th>
                <th
                  scope="col"
                  className="px-2 py-2 text-center sm:px-3 sm:py-3"
                >
                  Berths
                </th>
                <th
                  scope="col"
                  className="px-2 py-2 text-center sm:px-3 sm:py-3"
                >
                  Finals
                </th>
                <th
                  scope="col"
                  className="px-2 py-2 text-center sm:px-3 sm:py-3"
                >
                  <AwardHeading award={AwardsList.GSHL_CUP} label="Cups" />
                </th>
                <th
                  scope="col"
                  className="px-2 py-2 text-center sm:px-3 sm:py-3"
                >
                  <AwardHeading
                    award={AwardsList.GM_OF_THE_YEAR}
                    label="GMOTY"
                  />
                </th>
                <th
                  scope="col"
                  className="px-2 py-2 text-center sm:px-3 sm:py-3"
                >
                  <AwardHeading award={AwardsList.JACK_ADAMS} label="COTY" />
                </th>
                <th
                  scope="col"
                  className="px-2 py-2 text-center sm:px-3 sm:py-3"
                >
                  Other
                </th>
                <th
                  scope="col"
                  className="px-2 py-2 text-center sm:px-3 sm:py-3"
                >
                  <AwardHeading award={AwardsList.BROPHY} label="Brophy" />
                </th>
                <th
                  scope="col"
                  className="px-2 py-2 text-center sm:px-3 sm:py-3"
                >
                  Seasons
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rankings.map((entry) => (
                <tr
                  key={entry.owner.id}
                  className="group transition-colors hover:bg-slate-50"
                >
                  <td className="sticky left-0 z-20 w-12 min-w-12 bg-white px-1.5 py-2 text-center shadow-[1px_0_0_0_rgb(241_245_249)] group-hover:bg-slate-50 sm:static sm:z-auto sm:w-16 sm:min-w-0 sm:bg-transparent sm:px-3 sm:py-3 sm:shadow-none">
                    <div className="font-oswald text-base tabular-nums text-slate-900 sm:text-lg">
                      {entry.rank}
                    </div>
                    <div className="flex justify-center">
                      <Movement entry={entry} />
                    </div>
                  </td>
                  <th
                    scope="row"
                    className="sticky left-12 z-20 w-40 min-w-40 bg-white px-2 py-2 font-normal shadow-[1px_0_0_0_rgb(226_232_240)] group-hover:bg-slate-50 sm:static sm:z-auto sm:w-auto sm:min-w-0 sm:bg-transparent sm:px-3 sm:py-3 sm:shadow-none"
                  >
                    <div className="flex items-center gap-2.5">
                      <OwnerMark entry={entry} />
                      <div className="min-w-0">
                        <div className="truncate text-[11px] font-semibold text-slate-900 sm:text-xs">
                          {entry.displayName}
                        </div>
                        <div className="max-w-48 truncate text-[9px] text-slate-400 sm:text-[10px]">
                          {entry.primaryTeam?.name ?? "GSHL GM"}
                        </div>
                      </div>
                    </div>
                  </th>
                  <td className="px-2 py-2 text-right font-oswald text-lg font-semibold tabular-nums text-slate-950 sm:px-3 sm:py-3 sm:text-xl">
                    {formatRating(entry.rating)}
                  </td>
                  <td className="px-2 py-2 text-right sm:px-3 sm:py-3">
                    <SignedCell value={entry.matchupDelta} />
                  </td>
                  <td className="px-2 py-2 sm:px-3 sm:py-3">
                    <RecordCell record={entry.overallRecord} />
                  </td>
                  <td className="px-2 py-2 sm:px-3 sm:py-3">
                    <RecordCell record={entry.conferenceRecord} />
                  </td>
                  <td className="px-2 py-2 sm:px-3 sm:py-3">
                    <RecordCell record={entry.playoffRecord} />
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums sm:px-3 sm:py-3">
                    {entry.playoffAppearances}
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums sm:px-3 sm:py-3">
                    {entry.finalsAppearances}
                  </td>
                  <td className="px-2 py-2 text-center sm:px-3 sm:py-3">
                    <AwardMarks
                      award={AwardsList.GSHL_CUP}
                      count={entry.cups}
                      label="GSHL Cup"
                    />
                  </td>
                  <td className="px-2 py-2 text-center sm:px-3 sm:py-3">
                    <AwardMarks
                      award={AwardsList.GM_OF_THE_YEAR}
                      count={entry.gmAwards}
                      label="GM of the Year"
                    />
                  </td>
                  <td className="px-2 py-2 text-center sm:px-3 sm:py-3">
                    <AwardMarks
                      award={AwardsList.JACK_ADAMS}
                      count={entry.coachAwards}
                      label="Coach of the Year"
                    />
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums sm:px-3 sm:py-3">
                    {entry.otherAwards}
                  </td>
                  <td className="px-2 py-2 text-center sm:px-3 sm:py-3">
                    <AwardMarks
                      award={AwardsList.BROPHY}
                      count={entry.brophyAwards}
                      label="Brophy Trophy"
                      negative
                    />
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums sm:px-3 sm:py-3">
                    {entry.seasonsPlayed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 bg-slate-50 px-3 py-2.5 text-[9px] text-slate-500 sm:gap-x-5 sm:px-4 sm:py-3 sm:text-[10px]">
          <span>Standard range: 0–1000</span>
          <span>Entry rating: 250</span>
          <span>Elo form: 15%</span>
          <span>Playoffs +8</span>
          <span>Finals +18</span>
          <span>Cup +40</span>
          <span>GMOTY/COTY +20</span>
          <span>Other +5</span>
          <span className="text-red-600">Brophy −10</span>
        </div>
      </div>
    </div>
  );
}
