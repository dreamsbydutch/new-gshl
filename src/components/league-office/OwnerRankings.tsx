"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Crown,
  Flame,
  History,
  Medal,
  Minus,
  Shield,
  Swords,
  Target,
  Trophy,
  Users,
} from "lucide-react";

import { Skeleton } from "@gshl-components/ui/skeleton";
import { useOwnerRankingsData } from "@gshl-hooks";
import type {
  OwnerLadderBattle,
  OwnerRankingEntry,
  OwnerRankingRecord,
} from "@gshl-types";
import { cn } from "@gshl-utils";

const formatPercentage = (value: number) => `${(value * 100).toFixed(1)}%`;
const formatRating = (value: number) => Math.round(value).toLocaleString();

const recordLabel = (record: OwnerRankingRecord) =>
  `${record.wins}-${record.losses}${record.ties ? `-${record.ties}` : ""}`;

function OwnerMark({ entry, size = 52 }: { entry: OwnerRankingEntry; size?: number }) {
  if (entry.primaryTeam?.logoUrl) {
    return (
      <div className="shrink-0 rounded-2xl border border-white/70 bg-white p-1.5 shadow-emboss">
        <Image
          src={entry.primaryTeam.logoUrl}
          alt=""
          width={size}
          height={size}
          className="object-contain"
        />
      </div>
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white font-oswald text-xl text-slate-500 shadow-emboss"
      style={{ width: size + 12, height: size + 12 }}
    >
      {entry.displayName.slice(0, 2).toUpperCase()}
    </div>
  );
}

function Movement({ entry, compact = false }: { entry: OwnerRankingEntry; compact?: boolean }) {
  if (entry.rankChange > 0) {
    return (
      <span className={cn("inline-flex items-center gap-0.5 font-barlow font-bold text-emerald-600", compact ? "text-[10px]" : "text-xs")}>
        <ArrowUp className="h-3 w-3" aria-hidden="true" /> {entry.rankChange}
      </span>
    );
  }
  if (entry.rankChange < 0) {
    return (
      <span className={cn("inline-flex items-center gap-0.5 font-barlow font-bold text-red-500", compact ? "text-[10px]" : "text-xs")}>
        <ArrowDown className="h-3 w-3" aria-hidden="true" /> {Math.abs(entry.rankChange)}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center text-slate-400", compact ? "text-[10px]" : "text-xs")}>
      <Minus className="h-3 w-3" aria-hidden="true" />
    </span>
  );
}

function OwnerRankingsSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Skeleton className="h-24 rounded-3xl" />
      <Skeleton className="h-72 rounded-[2rem]" />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-48 rounded-3xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <Skeleton className="h-[40rem] rounded-[2rem]" />
        <Skeleton className="h-[32rem] rounded-[2rem]" />
      </div>
    </div>
  );
}

function ChampionHero({ champion }: { champion: OwnerRankingEntry }) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-amber-300/30 bg-slate-950 text-white shadow-[0_30px_80px_rgba(15,23,42,.25)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(250,204,21,.25),transparent_35%),radial-gradient(circle_at_85%_70%,rgba(59,130,246,.18),transparent_35%)]" />
      <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full border-[45px] border-white/[0.03]" />
      <div className="relative grid items-center gap-6 px-5 py-7 sm:grid-cols-[auto_1fr_auto] sm:px-9 sm:py-9">
        <div className="relative mx-auto sm:mx-0">
          <div className="absolute -left-3 -top-5 rotate-[-18deg] rounded-full bg-amber-400 p-2.5 text-amber-950 shadow-lg">
            <Crown className="h-5 w-5" aria-hidden="true" />
          </div>
          <OwnerMark entry={champion} size={96} />
        </div>
        <div className="text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 font-barlow text-[10px] uppercase tracking-[0.2em] text-amber-300">
              Current ladder king
            </span>
            <span className={cn("rounded-full px-3 py-1 font-barlow text-[10px] uppercase tracking-[0.16em]", champion.isActive ? "bg-emerald-400/15 text-emerald-300" : "bg-white/10 text-white/55")}>
              {champion.isActive ? "Active" : "Inactive legend"}
            </span>
          </div>
          <h2 className="mt-3 font-oswald text-4xl uppercase leading-none sm:text-6xl">{champion.displayName}</h2>
          <p className="mt-2 text-sm text-white/55">
            {champion.primaryTeam?.name ?? "GSHL Owner"} · {recordLabel(champion.overallRecord)} career record
          </p>
        </div>
        <div className="text-center sm:text-right">
          <p className="font-barlow text-[10px] uppercase tracking-[0.25em] text-white/45">Ladder rating · 0-1000 standard range</p>
          <p className="mt-1 font-oswald text-6xl font-bold tabular-nums text-amber-300 sm:text-7xl">{formatRating(champion.rating)}</p>
          <div className="mt-1 flex items-center justify-center gap-2 sm:justify-end">
            <Movement entry={champion} />
            <span className="text-xs text-white/45">this season</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function PodiumCard({ entry, place }: { entry: OwnerRankingEntry; place: number }) {
  const styles = [
    "border-amber-300 bg-gradient-to-b from-amber-50 to-white",
    "border-slate-300 bg-gradient-to-b from-slate-100 to-white",
    "border-orange-300 bg-gradient-to-b from-orange-50 to-white",
  ];
  return (
    <article className={cn("relative rounded-3xl border p-4 text-center shadow-[0_16px_36px_rgba(15,23,42,.08)]", styles[place - 1])}>
      <div className="absolute left-4 top-4 font-oswald text-3xl text-slate-300">#{place}</div>
      <div className="mx-auto w-fit"><OwnerMark entry={entry} size={56} /></div>
      <h3 className="mt-3 truncate font-oswald text-2xl text-slate-950">{entry.displayName}</h3>
      <p className="mt-1 font-oswald text-3xl tabular-nums text-slate-800">{formatRating(entry.rating)}</p>
      <div className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-500">
        <span>{formatPercentage(entry.overallRecord.winPercentage)}</span>
        <span className="text-slate-300">·</span>
        <span>{entry.cups} Cup{entry.cups === 1 ? "" : "s"}</span>
        <Movement entry={entry} compact />
      </div>
    </article>
  );
}

function LadderRow({
  entry,
  selected,
  onSelect,
}: {
  entry: OwnerRankingEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "grid w-full grid-cols-[2.5rem_auto_1fr_auto] items-center gap-3 border-b border-slate-100 px-3 py-3 text-left transition last:border-0 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 sm:grid-cols-[3rem_auto_1fr_auto_auto] sm:px-5",
        selected && "bg-slate-950 text-white hover:bg-slate-900",
        !entry.isActive && !selected && "bg-slate-50/60",
      )}
    >
      <div className="text-center">
        <span className={cn("font-oswald text-2xl tabular-nums", selected ? "text-white" : entry.rank <= 3 ? "text-amber-600" : "text-slate-400")}>#{entry.rank}</span>
        <div className="mt-0.5"><Movement entry={entry} compact /></div>
      </div>
      <OwnerMark entry={entry} size={36} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className={cn("truncate font-oswald text-lg", selected ? "text-white" : "text-slate-950")}>{entry.displayName}</h3>
          {!entry.isActive ? (
            <span className={cn("hidden rounded-full px-2 py-0.5 font-barlow text-[9px] uppercase tracking-wider sm:inline", selected ? "bg-white/10 text-white/45" : "bg-slate-200 text-slate-500")}>Inactive</span>
          ) : null}
        </div>
        <p className={cn("truncate text-xs", selected ? "text-white/45" : "text-slate-400")}>
          {recordLabel(entry.overallRecord)} · {formatPercentage(entry.overallRecord.winPercentage)}
        </p>
      </div>
      <div className="hidden text-right sm:block">
        <p className={cn("font-barlow text-[9px] uppercase tracking-wider", selected ? "text-white/35" : "text-slate-400")}>Last battle</p>
        <p className={cn("font-oswald text-sm", entry.matchupDelta > 0 ? "text-emerald-500" : entry.matchupDelta < 0 ? "text-red-500" : selected ? "text-white/45" : "text-slate-400")}>
          {entry.matchupDelta > 0 ? "+" : ""}{entry.matchupDelta.toFixed(1)}
        </p>
      </div>
      <div className="text-right">
        <p className={cn("font-oswald text-2xl tabular-nums", selected ? "text-amber-300" : "text-slate-900")}>{formatRating(entry.rating)}</p>
        <p className={cn("font-barlow text-[9px] uppercase tracking-wider", selected ? "text-white/35" : "text-slate-400")}>rating</p>
      </div>
    </button>
  );
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="font-barlow text-[9px] uppercase tracking-[0.17em] text-slate-400">{label}</p>
      <p className="mt-1 font-oswald text-2xl text-slate-950">{value}</p>
      {detail ? <p className="mt-0.5 text-[10px] text-slate-400">{detail}</p> : null}
    </div>
  );
}

function OwnerProfile({ entry }: { entry: OwnerRankingEntry }) {
  return (
    <aside className="rounded-[2rem] border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4 shadow-[0_18px_45px_rgba(15,23,42,.08)] sm:p-5 lg:sticky lg:top-24 lg:self-start">
      <div className="flex items-center gap-4">
        <OwnerMark entry={entry} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-oswald text-3xl text-slate-300">#{entry.rank}</span>
            <span className={cn("rounded-full px-2.5 py-1 font-barlow text-[9px] uppercase tracking-wider", entry.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500")}>
              {entry.isActive ? "Active" : "Inactive"}
            </span>
          </div>
          <h2 className="truncate font-oswald text-3xl leading-none text-slate-950">{entry.displayName}</h2>
          <p className="mt-1 truncate text-xs text-slate-500">{entry.primaryTeam?.name ?? "GSHL Owner"}</p>
        </div>
      </div>

      <div className="mt-5 rounded-3xl bg-slate-950 p-4 text-white">
        <div className="flex items-end justify-between">
          <div>
            <p className="font-barlow text-[9px] uppercase tracking-[0.2em] text-white/40">Ladder rating · 0-1000 standard range</p>
            <p className="font-oswald text-5xl tabular-nums text-amber-300">{formatRating(entry.rating)}</p>
          </div>
          <Movement entry={entry} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-3 text-center">
          <div><p className="font-oswald text-lg">{formatRating(entry.elo)}</p><p className="font-barlow text-[8px] uppercase tracking-wider text-white/35">Matchup Elo</p></div>
          <div><p className="font-oswald text-lg text-emerald-300">+{Math.round(entry.achievementBonus)}</p><p className="font-barlow text-[8px] uppercase tracking-wider text-white/35">Legacy</p></div>
          <div><p className={cn("font-oswald text-lg", entry.performanceAdjustment >= 0 ? "text-sky-300" : "text-red-300")}>{entry.performanceAdjustment >= 0 ? "+" : ""}{Math.round(entry.performanceAdjustment)}</p><p className="font-barlow text-[8px] uppercase tracking-wider text-white/35">Consistency</p></div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Metric label="Career record" value={recordLabel(entry.overallRecord)} detail={formatPercentage(entry.overallRecord.winPercentage)} />
        <Metric label="Conference" value={recordLabel(entry.conferenceRecord)} detail={formatPercentage(entry.conferenceRecord.winPercentage)} />
        <Metric label="Playoffs" value={recordLabel(entry.playoffRecord)} detail={formatPercentage(entry.playoffRecord.winPercentage)} />
        <Metric label="Seasons" value={entry.seasonsPlayed} detail={`${entry.playoffAppearances} playoff berths`} />
      </div>

      <div className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-4">
        <h3 className="flex items-center gap-2 font-oswald text-xl text-amber-950"><Trophy className="h-5 w-5 text-amber-600" /> Legacy cabinet</h3>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div><p className="font-oswald text-3xl text-amber-700">{entry.cups}</p><p className="font-barlow text-[8px] uppercase tracking-wider text-amber-800/60">Cups</p></div>
          <div><p className="font-oswald text-3xl text-amber-700">{entry.finalsAppearances}</p><p className="font-barlow text-[8px] uppercase tracking-wider text-amber-800/60">Finals</p></div>
          <div><p className="font-oswald text-3xl text-amber-700">{entry.totalAwards}</p><p className="font-barlow text-[8px] uppercase tracking-wider text-amber-800/60">Awards</p></div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-amber-200 pt-3">
          <div className="rounded-xl bg-white/70 p-2 text-center"><p className="font-oswald text-2xl">{entry.gmAwards}</p><p className="font-barlow text-[8px] uppercase tracking-wider text-slate-500">GM of the Year</p></div>
          <div className="rounded-xl bg-white/70 p-2 text-center"><p className="font-oswald text-2xl">{entry.coachAwards}</p><p className="font-barlow text-[8px] uppercase tracking-wider text-slate-500">Coach of the Year</p></div>
        </div>
      </div>
    </aside>
  );
}

function BattleCard({ battle }: { battle: OwnerLadderBattle }) {
  const playoff = ["QF", "SF", "F"].includes(battle.gameType);
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_14px_32px_rgba(15,23,42,.07)]">
      <div className="flex items-center justify-between gap-3">
        <span className={cn("rounded-full px-2.5 py-1 font-barlow text-[9px] uppercase tracking-[0.16em]", playoff ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500")}>
          {playoff ? "Playoff battle" : "Ladder battle"}
        </span>
        <span className="text-[10px] text-slate-400">{battle.seasonName}</span>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
        <div className="min-w-0">
          <p className={cn("truncate font-oswald text-lg", battle.winnerOwnerId === battle.homeOwnerId ? "text-slate-950" : "text-slate-500")}>{battle.homeOwnerName}</p>
          <p className="font-oswald text-3xl">{battle.homeScore}</p>
          <p className={cn("text-xs", battle.homeDelta >= 0 ? "text-emerald-600" : "text-red-500")}>{battle.homeDelta >= 0 ? "+" : ""}{battle.homeDelta.toFixed(1)}</p>
        </div>
        <Swords className="h-5 w-5 text-slate-300" aria-hidden="true" />
        <div className="min-w-0">
          <p className={cn("truncate font-oswald text-lg", battle.winnerOwnerId === battle.awayOwnerId ? "text-slate-950" : "text-slate-500")}>{battle.awayOwnerName}</p>
          <p className="font-oswald text-3xl">{battle.awayScore}</p>
          <p className={cn("text-xs", battle.awayDelta >= 0 ? "text-emerald-600" : "text-red-500")}>{battle.awayDelta >= 0 ? "+" : ""}{battle.awayDelta.toFixed(1)}</p>
        </div>
      </div>
    </article>
  );
}

export function OwnerRankings() {
  const { data, isLoading, error } = useOwnerRankingsData();
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [showInactive, setShowInactive] = useState(true);

  useEffect(() => {
    if (data.rankings.length && !data.rankings.some((entry) => entry.owner.id === selectedOwnerId)) {
      setSelectedOwnerId(data.rankings[0]?.owner.id ?? "");
    }
  }, [data.rankings, selectedOwnerId]);

  const selectedEntry = data.rankings.find((entry) => entry.owner.id === selectedOwnerId) ?? data.rankings[0];
  const visibleRankings = useMemo(
    () => showInactive ? data.rankings : data.rankings.filter((entry) => entry.isActive),
    [data.rankings, showInactive],
  );

  if (isLoading) return <OwnerRankingsSkeleton />;
  if (error) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-red-200 bg-red-50 p-8 text-center">
        <Shield className="mx-auto h-8 w-8 text-red-500" />
        <h1 className="mt-3 font-oswald text-2xl text-red-950">The Owner Ladder is unavailable</h1>
        <p className="mt-2 text-sm text-red-700">The league history could not be assembled right now.</p>
      </div>
    );
  }
  const champion = data.rankings[0];
  if (!champion || !selectedEntry) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center">
        <Users className="mx-auto h-8 w-8 text-slate-400" />
        <h1 className="mt-3 font-oswald text-2xl text-slate-900">No owners are on the ladder yet</h1>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-8">
      <header className="px-1 text-center sm:text-left">
        <p className="font-barlow text-xs uppercase tracking-[0.3em] text-slate-400">GSHL Owner Ladder</p>
        <h1 className="mt-1 font-oswald text-4xl uppercase leading-none text-slate-950 sm:text-6xl">Climb or get passed</h1>
        <p className="mx-auto mt-3 max-w-3xl text-sm text-slate-500 sm:mx-0 sm:text-base">
          Every owner, every era, one living ladder. Newcomers enter at 250 and earn every place through matchups, consistency, playoff runs and hardware.
        </p>
      </header>

      <ChampionHero champion={champion} />

      <section className="grid gap-3 sm:grid-cols-3">
        {data.rankings.slice(0, 3).map((entry, index) => (
          <PodiumCard key={entry.owner.id} entry={entry} place={index + 1} />
        ))}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,.08)]">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 p-4 sm:p-5">
            <div>
              <p className="font-barlow text-[10px] uppercase tracking-[0.23em] text-slate-400">All-time order</p>
              <h2 className="font-oswald text-3xl text-slate-950">The ladder</h2>
            </div>
            <button
              type="button"
              aria-pressed={showInactive}
              onClick={() => setShowInactive((value) => !value)}
              className={cn("rounded-full border px-3 py-2 font-barlow text-[10px] uppercase tracking-[0.15em] transition", showInactive ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-500")}
            >
              {showInactive ? "All owners" : "Active only"}
            </button>
          </div>
          <div>
            {visibleRankings.map((entry) => (
              <LadderRow key={entry.owner.id} entry={entry} selected={entry.owner.id === selectedEntry.owner.id} onSelect={() => setSelectedOwnerId(entry.owner.id)} />
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500">
            <span>{data.activeOwnerCount} active</span>
            <span>{data.inactiveOwnerCount} inactive legends</span>
          </div>
        </section>
        <OwnerProfile entry={selectedEntry} />
      </div>

      <section className="rounded-[2rem] border border-slate-200 bg-slate-50 p-4 shadow-[0_18px_45px_rgba(15,23,42,.07)] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-barlow text-[10px] uppercase tracking-[0.24em] text-slate-400">Rating swings</p>
            <h2 className="font-oswald text-3xl text-slate-950">Latest ladder battles</h2>
            <p className="mt-1 text-sm text-slate-500">Opponent strength, stage and margin decide how many points change hands.</p>
          </div>
          <div className="hidden rounded-2xl bg-slate-950 p-3 text-white sm:block"><Flame className="h-5 w-5" /></div>
        </div>
        {data.recentBattles.length ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.recentBattles.slice(0, 6).map((battle) => <BattleCard key={battle.matchupId} battle={battle} />)}
          </div>
        ) : (
          <p className="mt-5 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">Completed matchups will appear here as the ladder comes alive.</p>
        )}
      </section>

      <details className="group rounded-3xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-100 p-2 text-slate-500"><Target className="h-4 w-4" /></div>
            <div><h2 className="font-oswald text-xl text-slate-950">How the Owner Ladder works</h2><p className="text-xs text-slate-500">Matchup Elo meets career legacy</p></div>
          </div>
          <ChevronDown className="h-5 w-5 text-slate-400 transition group-open:rotate-180" />
        </summary>
        <div className="grid gap-4 border-t border-slate-100 p-5 text-sm leading-6 text-slate-600 sm:grid-cols-3 sm:p-6">
          <div><Swords className="mb-2 h-5 w-5 text-sky-600" /><h3 className="font-oswald text-lg text-slate-950">Matchup Elo</h3><p>Every completed matchup transfers rating points based on opponent strength. Playoff rounds carry progressively larger stakes, and decisive wins move the ladder a little more.</p></div>
          <div><History className="mb-2 h-5 w-5 text-emerald-600" /><h3 className="font-oswald text-lg text-slate-950">Career consistency</h3><p>All-time, conference and playoff winning percentages add a confidence-adjusted performance score. A Bayesian baseline prevents tiny samples from jumping the queue.</p></div>
          <div><Medal className="mb-2 h-5 w-5 text-amber-600" /><h3 className="font-oswald text-lg text-slate-950">Legacy score</h3><p>Playoff berth +8, Finals +18, Cup +40, Coach or GM of the Year +20, and other competitive awards +5. The last-place Brophy Trophy is -10. Every owner enters at 250, and extreme careers can move beyond the standard 0-1000 range.</p></div>
        </div>
      </details>
    </div>
  );
}
