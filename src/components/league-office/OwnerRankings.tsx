"use client";

import Image from "next/image";
import { ArrowDown, ArrowUp, Minus, Shield, Users } from "lucide-react";

import { Skeleton } from "@gshl-components/ui/skeleton";
import { useOwnerRankingsData } from "@gshl-hooks";
import { AWARD_CATALOG_BY_KEY } from "@gshl-lib/config/awards";
import {
  AwardsList,
  type OwnerRankingEntry,
  type OwnerRankingRecord,
} from "@gshl-types";
import { cn } from "@gshl-utils";

const formatRating = (value: number) => Math.round(value).toLocaleString();
const formatSigned = (value: number) =>
  `${value > 0 ? "+" : ""}${Math.round(value).toLocaleString()}`;
const formatPercentage = (value: number) => `${(value * 100).toFixed(1)}%`;
const recordLabel = (record: OwnerRankingRecord) =>
  `${record.wins}-${record.losses}${record.ties ? `-${record.ties}` : ""}`;

function OwnerMark({ entry }: { entry: OwnerRankingEntry }) {
  if (entry.primaryTeam?.logoUrl) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white p-1">
        <Image
          src={entry.primaryTeam.logoUrl}
          alt=""
          width={24}
          height={24}
          className="max-h-6 max-w-6 object-contain"
        />
      </div>
    );
  }

  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 font-oswald text-xs text-slate-500">
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
      <div className="font-medium text-slate-700">{recordLabel(record)}</div>
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
  award: AwardsList;
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
      className="h-auto shrink-0 object-contain"
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
  award: AwardsList;
  count: number;
  label: string;
  negative?: boolean;
}) {
  if (!count) return <span className="text-slate-300">—</span>;

  return (
    <div
      className={cn(
        "flex min-w-10 flex-wrap justify-center gap-0.5",
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

function AwardHeading({ award, label }: { award: AwardsList; label: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5" title={label}>
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
          <h1 className="mt-1 font-oswald text-4xl uppercase leading-none text-slate-950">
            GM Ladder
          </h1>
          <p className="mt-2 text-xs text-slate-500">
            Career results, playoff performance, and legacy lead the rating;
            matchup Elo contributes a small form adjustment. New GMs start at
            250.
          </p>
        </div>
      </header>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1160px] border-collapse text-left text-xs">
            <caption className="sr-only">
              All-time GM ladder with records, playoff results, and awards
            </caption>
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.11em] text-slate-500">
              <tr>
                <th scope="col" className="w-16 px-3 py-3 text-center">
                  Rank
                </th>
                <th scope="col" className="min-w-56 px-3 py-3">
                  GM
                </th>
                <th scope="col" className="px-3 py-3 text-right">
                  Rating
                </th>
                <th scope="col" className="px-3 py-3 text-right">
                  Last
                </th>
                <th scope="col" className="px-3 py-3">
                  Overall
                </th>
                <th scope="col" className="px-3 py-3">
                  Conference
                </th>
                <th scope="col" className="px-3 py-3">
                  Playoffs
                </th>
                <th scope="col" className="px-3 py-3 text-center">
                  Berths
                </th>
                <th scope="col" className="px-3 py-3 text-center">
                  Finals
                </th>
                <th scope="col" className="px-3 py-3 text-center">
                  <AwardHeading award={AwardsList.GSHL_CUP} label="Cups" />
                </th>
                <th scope="col" className="px-3 py-3 text-center">
                  <AwardHeading
                    award={AwardsList.GM_OF_THE_YEAR}
                    label="GMOTY"
                  />
                </th>
                <th scope="col" className="px-3 py-3 text-center">
                  <AwardHeading award={AwardsList.JACK_ADAMS} label="COTY" />
                </th>
                <th scope="col" className="px-3 py-3 text-center">
                  Other
                </th>
                <th scope="col" className="px-3 py-3 text-center">
                  <AwardHeading award={AwardsList.BROPHY} label="Brophy" />
                </th>
                <th scope="col" className="px-3 py-3 text-center">
                  Seasons
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rankings.map((entry) => (
                <tr
                  key={entry.owner.id}
                  className="transition-colors hover:bg-slate-50"
                >
                  <td className="px-3 py-3 text-center">
                    <div className="font-oswald text-lg tabular-nums text-slate-900">
                      {entry.rank}
                    </div>
                    <div className="flex justify-center">
                      <Movement entry={entry} />
                    </div>
                  </td>
                  <th scope="row" className="px-3 py-3 font-normal">
                    <div className="flex items-center gap-2.5">
                      <OwnerMark entry={entry} />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-900">
                          {entry.displayName}
                        </div>
                        <div className="max-w-48 truncate text-[10px] text-slate-400">
                          {entry.primaryTeam?.name ?? "GSHL GM"}
                        </div>
                      </div>
                    </div>
                  </th>
                  <td className="px-3 py-3 text-right font-oswald text-xl font-semibold tabular-nums text-slate-950">
                    {formatRating(entry.rating)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <SignedCell value={entry.matchupDelta} />
                  </td>
                  <td className="px-3 py-3">
                    <RecordCell record={entry.overallRecord} />
                  </td>
                  <td className="px-3 py-3">
                    <RecordCell record={entry.conferenceRecord} />
                  </td>
                  <td className="px-3 py-3">
                    <RecordCell record={entry.playoffRecord} />
                  </td>
                  <td className="px-3 py-3 text-center tabular-nums">
                    {entry.playoffAppearances}
                  </td>
                  <td className="px-3 py-3 text-center tabular-nums">
                    {entry.finalsAppearances}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <AwardMarks
                      award={AwardsList.GSHL_CUP}
                      count={entry.cups}
                      label="GSHL Cup"
                    />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <AwardMarks
                      award={AwardsList.GM_OF_THE_YEAR}
                      count={entry.gmAwards}
                      label="GM of the Year"
                    />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <AwardMarks
                      award={AwardsList.JACK_ADAMS}
                      count={entry.coachAwards}
                      label="Coach of the Year"
                    />
                  </td>
                  <td className="px-3 py-3 text-center tabular-nums">
                    {entry.otherAwards}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <AwardMarks
                      award={AwardsList.BROPHY}
                      count={entry.brophyAwards}
                      label="Brophy Trophy"
                      negative
                    />
                  </td>
                  <td className="px-3 py-3 text-center tabular-nums">
                    {entry.seasonsPlayed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-slate-200 bg-slate-50 px-4 py-3 text-[10px] text-slate-500">
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
