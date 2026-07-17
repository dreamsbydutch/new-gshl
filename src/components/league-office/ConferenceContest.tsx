"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  CalendarDays,
  ChevronDown,
  Crown,
  Info,
  Medal,
  Shield,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
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
import { getAwardLabel } from "@gshl-lib/config/awards";
import type {
  ConferenceContestConferenceInfo,
  ConferenceContestComponentKey,
  ConferenceContestRating,
  ConferenceContestRatingMode,
  ConferenceContestRecord,
  ConferenceContestSeasonViewModel,
  GSHLTeam,
  TeamAward,
} from "@gshl-types";
import { cn } from "@gshl-utils";

const COMPONENTS: Array<{
  key: ConferenceContestComponentKey;
  label: string;
  description: string;
  weight: string;
  icon: typeof Swords;
}> = [
  {
    key: "headToHead",
    label: "Head to head",
    description: "Completed interconference matchups",
    weight: "35%",
    icon: Swords,
  },
  {
    key: "playoffs",
    label: "Playoff performance",
    description: "Wins, finalists and playoff depth",
    weight: "30%",
    icon: Shield,
  },
  {
    key: "cups",
    label: "GSHL Cups",
    description: "The league's ultimate prize",
    weight: "20%",
    icon: Trophy,
  },
  {
    key: "awards",
    label: "League awards",
    description: "Leadership awards carry extra weight",
    weight: "15%",
    icon: Medal,
  },
];

const cleanConferenceName = (name: string) => name.replace(" Hotel", "");

const conferenceTone = (conference: ConferenceContestConferenceInfo) => {
  const value = `${conference.name} ${conference.abbr ?? ""}`.toLowerCase();
  return value.includes("sunview") || value.includes("sv")
    ? {
        strong: "#1a4c83",
        line: "#3b82f6",
        panel: "from-sunview-900 via-sunview-800 to-sunview-700",
        soft: "bg-sunview-50 border-sunview-200",
        text: "text-sunview-800",
      }
    : {
        strong: "#772628",
        line: "#ef4444",
        panel: "from-hotel-900 via-hotel-800 to-hotel-700",
        soft: "bg-hotel-50 border-hotel-200",
        text: "text-hotel-800",
      };
};

const recordLabel = (record?: ConferenceContestRecord) => {
  const value = record ?? { wins: 0, losses: 0, ties: 0 };
  return `${value.wins}-${value.losses}${value.ties ? `-${value.ties}` : ""}`;
};

function ConferenceLogo({
  conference,
  size = 88,
}: {
  conference: ConferenceContestConferenceInfo;
  size?: number;
}) {
  if (!conference.logoUrl) {
    return (
      <div
        className="flex items-center justify-center rounded-[1.75rem] border border-white/30 bg-white/15 font-oswald text-xl font-bold text-white shadow-emboss backdrop-blur"
        style={{ width: size, height: size }}
      >
        {conference.abbr ?? conference.name.slice(0, 2)}
      </div>
    );
  }
  return (
    <div className="rounded-[1.75rem] border border-white/50 bg-white/95 p-2 shadow-emboss">
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

function RatingHero({
  left,
  right,
  rating,
  mode,
  onModeChange,
}: {
  left: ConferenceContestConferenceInfo;
  right: ConferenceContestConferenceInfo;
  rating: ConferenceContestRating;
  mode: ConferenceContestRatingMode;
  onModeChange: (mode: ConferenceContestRatingMode) => void;
}) {
  const leftValue = rating.ratingByConferenceId[left.id] ?? 50;
  const leftDisplay = Math.round(leftValue);
  const rightDisplay = 100 - leftDisplay;
  const leader = leftDisplay === rightDisplay ? null : leftDisplay > rightDisplay ? left : right;
  const leftTone = conferenceTone(left);
  const rightTone = conferenceTone(right);

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-950 text-white shadow-[0_28px_70px_rgba(15,23,42,0.22)]">
      <div className="absolute inset-0 grid grid-cols-2 opacity-95">
        <div className={cn("bg-gradient-to-br", leftTone.panel)} />
        <div className={cn("bg-gradient-to-bl", rightTone.panel)} />
      </div>
      <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
      <div className="relative px-4 py-6 sm:px-8 sm:py-8">
        <div className="flex justify-center">
          <div
            className="inline-flex rounded-full border border-white/20 bg-black/20 p-1 shadow-inner backdrop-blur"
            aria-label="Rating timeframe"
          >
            {(["current", "allTime"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => onModeChange(value)}
                className={cn(
                  "rounded-full px-4 py-2 font-barlow text-xs uppercase tracking-[0.18em] transition sm:px-6",
                  mode === value
                    ? "bg-white text-slate-950 shadow-lg"
                    : "text-white/70 hover:text-white",
                )}
              >
                {value === "current" ? "Current form" : "All time"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-7 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-8">
          <div className="flex min-w-0 flex-col items-center text-center">
            <ConferenceLogo conference={left} size={88} />
            <h2 className="mt-3 font-oswald text-lg uppercase leading-none sm:text-3xl">
              {cleanConferenceName(left.name)}
            </h2>
            <p className="mt-1 font-barlow text-[10px] uppercase tracking-[0.24em] text-white/60 sm:text-xs">
              {left.abbr ?? "Conference"}
            </p>
          </div>

          <div className="text-center">
            <p className="font-barlow text-[9px] uppercase tracking-[0.28em] text-white/55 sm:text-xs">
              Battle rating
            </p>
            <div className="mt-1 flex items-center gap-1 font-oswald text-5xl font-bold tabular-nums drop-shadow-lg sm:gap-3 sm:text-8xl">
              <span>{leftDisplay}</span>
              <span className="text-2xl font-normal text-white/35 sm:text-4xl">:</span>
              <span>{rightDisplay}</span>
            </div>
            <p className="mx-auto mt-2 max-w-48 text-[10px] text-white/70 sm:text-sm">
              {leader
                ? `${cleanConferenceName(leader.name)} holds the edge`
                : "The conferences are dead even"}
            </p>
          </div>

          <div className="flex min-w-0 flex-col items-center text-center">
            <ConferenceLogo conference={right} size={88} />
            <h2 className="mt-3 font-oswald text-lg uppercase leading-none sm:text-3xl">
              {cleanConferenceName(right.name)}
            </h2>
            <p className="mt-1 font-barlow text-[10px] uppercase tracking-[0.24em] text-white/60 sm:text-xs">
              {right.abbr ?? "Conference"}
            </p>
          </div>
        </div>

        <div className="mx-auto mt-6 max-w-2xl text-center text-xs text-white/60 sm:text-sm">
          {mode === "current"
            ? "Recent seasons lead, while every era still carries meaningful weight."
            : "Every season counts equally in the complete conference legacy."}
        </div>
      </div>
    </section>
  );
}

function ComponentCard({
  component,
  left,
  right,
  rating,
}: {
  component: (typeof COMPONENTS)[number];
  left: ConferenceContestConferenceInfo;
  right: ConferenceContestConferenceInfo;
  rating: ConferenceContestRating;
}) {
  const Icon = component.icon;
  const leftValue = rating.componentsByConferenceId[left.id]?.[component.key] ?? 50;
  const leftDisplay = Math.round(leftValue);
  const rightDisplay = 100 - leftDisplay;
  const leftTone = conferenceTone(left);
  const rightTone = conferenceTone(right);
  return (
    <article className="rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4 shadow-[0_15px_35px_rgba(15,23,42,0.07)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="rounded-2xl bg-slate-950 p-2.5 text-white shadow-lg">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-oswald text-xl leading-none text-slate-950">
              {component.label}
            </h3>
            <p className="mt-1 text-xs text-slate-500">{component.description}</p>
          </div>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-barlow text-xs font-bold uppercase tracking-wider text-slate-500">
          {component.weight}
        </span>
      </div>
      <div className="mt-5 flex items-end justify-between font-oswald text-2xl tabular-nums">
        <span className={leftTone.text}>{leftDisplay}</span>
        <span className={rightTone.text}>{rightDisplay}</span>
      </div>
      <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-slate-100 shadow-inner">
        <div
          className="h-full transition-[width] duration-500"
          style={{ width: `${leftValue}%`, backgroundColor: leftTone.strong }}
          aria-hidden="true"
        />
        <div className="h-full flex-1" style={{ backgroundColor: rightTone.strong }} aria-hidden="true" />
      </div>
      <div className="mt-2 flex justify-between font-barlow text-[10px] uppercase tracking-[0.16em] text-slate-400">
        <span>{left.abbr ?? cleanConferenceName(left.name)}</span>
        <span>{right.abbr ?? cleanConferenceName(right.name)}</span>
      </div>
    </article>
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
    name: season.seasonName,
    left: Number((season.ratingByConferenceId[left.id] ?? 50).toFixed(1)),
    right: Number((season.ratingByConferenceId[right.id] ?? 50).toFixed(1)),
  }));
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-barlow text-[10px] uppercase tracking-[0.25em] text-slate-400">Season by season</p>
          <h2 className="mt-1 font-oswald text-2xl text-slate-950 sm:text-3xl">The balance of power</h2>
          <p className="mt-1 text-sm text-slate-500">How each conference&apos;s single-season rating has moved over time.</p>
        </div>
        <div className="hidden rounded-2xl bg-slate-100 p-3 text-slate-500 sm:block">
          <CalendarDays className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
      <div className="mt-5 h-72 w-full" aria-label="Conference rating history chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: -22, bottom: 0 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <Tooltip
              formatter={(value: number, name: string) => [`${value.toFixed(1)}`, name]}
              contentStyle={{ borderRadius: 16, borderColor: "#e2e8f0", boxShadow: "0 12px 30px rgba(15,23,42,.12)" }}
            />
            <Legend />
            <Line type="monotone" dataKey="left" name={cleanConferenceName(left.name)} stroke={leftTone.line} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            <Line type="monotone" dataKey="right" name={cleanConferenceName(right.name)} stroke={rightTone.line} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function TeamMark({ team }: { team: GSHLTeam }) {
  const label = team.name ?? team.abbr ?? "GSHL team";
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm">
      {team.logoUrl ? (
        <Image src={team.logoUrl} alt="" width={28} height={28} className="h-7 w-7 object-contain" />
      ) : (
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 font-barlow text-[9px] text-slate-500">
          {team.abbr ?? "G"}
        </div>
      )}
      <span className="max-w-36 truncate text-xs text-slate-700">{label}</span>
    </div>
  );
}

function TeamCollection({ teams, empty = "None yet" }: { teams: GSHLTeam[]; empty?: string }) {
  if (!teams.length) return <span className="text-sm text-slate-400">{empty}</span>;
  return <div className="flex flex-wrap gap-2">{teams.map((team, index) => <TeamMark key={`${team.id}-${index}`} team={team} />)}</div>;
}

function LeadershipCard({
  title,
  icon: Icon,
  leftAwards,
  rightAwards,
  left,
  right,
  teamsById,
}: {
  title: string;
  icon: typeof Crown;
  leftAwards: TeamAward[];
  rightAwards: TeamAward[];
  left: ConferenceContestConferenceInfo;
  right: ConferenceContestConferenceInfo;
  teamsById: Map<string, GSHLTeam>;
}) {
  const latestWinner = (awards: TeamAward[]) => {
    const latest = awards[0];
    const team = latest ? teamsById.get(String(latest.teamId)) : undefined;
    return team?.ownerNickname ?? team?.ownerFirstName ?? team?.name ?? "—";
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <h4 className="font-barlow text-xs uppercase tracking-[0.18em]">{title}</h4>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-start gap-3 text-center">
        <div>
          <p className={cn("font-oswald text-3xl", conferenceTone(left).text)}>{leftAwards.length}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{latestWinner(leftAwards)}</p>
        </div>
        <div className="pt-2 text-xs text-slate-300">VS</div>
        <div>
          <p className={cn("font-oswald text-3xl", conferenceTone(right).text)}>{rightAwards.length}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{latestWinner(rightAwards)}</p>
        </div>
      </div>
    </div>
  );
}

function StatBlock({ label, left, right }: { label: string; left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_7rem_1fr] items-center gap-2 border-b border-slate-100 py-3 last:border-0 sm:grid-cols-[1fr_10rem_1fr]">
      <div className="text-right font-oswald text-lg text-slate-900">{left}</div>
      <div className="text-center font-barlow text-[10px] uppercase tracking-[0.15em] text-slate-400">{label}</div>
      <div className="font-oswald text-lg text-slate-900">{right}</div>
    </div>
  );
}

function SeasonExplorer({
  seasons,
  selectedSeason,
  onSelect,
  teamsById,
}: {
  seasons: ConferenceContestSeasonViewModel[];
  selectedSeason: ConferenceContestSeasonViewModel;
  onSelect: (seasonId: string) => void;
  teamsById: Map<string, GSHLTeam>;
}) {
  const router = useAppRouter();
  const { setSelectedSeasonId } = useSeasonNavigation();
  const left = selectedSeason.leftConference;
  const right = selectedSeason.rightConference;
  const leftId = left.id;
  const rightId = right.id;
  const leftRating = Math.round(selectedSeason.ratingByConferenceId[leftId] ?? 50);
  const rightRating = 100 - leftRating;
  const allAwards = [
    ...(selectedSeason.awardsByConferenceId[leftId] ?? []),
    ...(selectedSeason.awardsByConferenceId[rightId] ?? []),
  ];
  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-50 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
      <div className="border-b border-slate-200 bg-white p-4 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="font-barlow text-[10px] uppercase tracking-[0.25em] text-slate-400">Season explorer</p>
            <h2 className="mt-1 font-oswald text-2xl text-slate-950 sm:text-3xl">Inside the battle</h2>
          </div>
          <label className="relative block">
            <span className="sr-only">Choose a season</span>
            <select
              value={selectedSeason.seasonId}
              onChange={(event) => onSelect(event.target.value)}
              className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2 pl-4 pr-10 font-oswald text-base text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 sm:w-56"
            >
              {seasons.map((season) => (
                <option key={season.seasonId} value={season.seasonId}>
                  {season.seasonName}{season.isActive ? " · Live" : ""}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-slate-400" aria-hidden="true" />
          </label>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        <div className="rounded-3xl bg-slate-950 px-4 py-5 text-white sm:px-6">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="text-center">
              <p className="font-barlow text-[10px] uppercase tracking-[0.18em] text-white/55">{cleanConferenceName(left.name)}</p>
              <p className="mt-1 font-oswald text-5xl tabular-nums">{leftRating}</p>
            </div>
            <div className="text-center">
              <p className="font-barlow text-[9px] uppercase tracking-[0.2em] text-white/40">{selectedSeason.seasonYear}</p>
              <Swords className="mx-auto mt-1 h-5 w-5 text-white/30" aria-hidden="true" />
            </div>
            <div className="text-center">
              <p className="font-barlow text-[10px] uppercase tracking-[0.18em] text-white/55">{cleanConferenceName(right.name)}</p>
              <p className="mt-1 font-oswald text-5xl tabular-nums">{rightRating}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-3 sm:px-5">
          <StatBlock label="H2H record" left={recordLabel(selectedSeason.headToHeadRecordByConferenceId[leftId])} right={recordLabel(selectedSeason.headToHeadRecordByConferenceId[rightId])} />
          <StatBlock label="Playoff record" left={recordLabel(selectedSeason.playoffRecordByConferenceId[leftId])} right={recordLabel(selectedSeason.playoffRecordByConferenceId[rightId])} />
          <StatBlock label="Finalists" left={selectedSeason.finalsTeamsByConferenceId[leftId]?.length ?? 0} right={selectedSeason.finalsTeamsByConferenceId[rightId]?.length ?? 0} />
          <StatBlock label="Award points" left={selectedSeason.awardPointsByConferenceId[leftId] ?? 0} right={selectedSeason.awardPointsByConferenceId[rightId] ?? 0} />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {[left, right].map((conference) => {
            const conferenceId = conference.id;
            const champions = selectedSeason.championTeamsByConferenceId[conferenceId] ?? [];
            return (
              <article key={conferenceId} className={cn("rounded-3xl border p-4 sm:p-5", conferenceTone(conference).soft)}>
                <div className="flex items-center gap-3">
                  <ConferenceLogo conference={conference} size={44} />
                  <div>
                    <p className="font-barlow text-[10px] uppercase tracking-[0.2em] text-slate-400">{conference.abbr}</p>
                    <h3 className="font-oswald text-xl text-slate-950">{cleanConferenceName(conference.name)}</h3>
                  </div>
                </div>
                <div className="mt-5 space-y-5">
                  <div>
                    <h4 className="mb-2 flex items-center gap-2 font-barlow text-[10px] uppercase tracking-[0.18em] text-slate-500"><Trophy className="h-4 w-4" /> Cup winner</h4>
                    <TeamCollection teams={champions} empty={selectedSeason.isActive ? "Still to be decided" : "No Cup"} />
                  </div>
                  <div>
                    <h4 className="mb-2 flex items-center gap-2 font-barlow text-[10px] uppercase tracking-[0.18em] text-slate-500"><Users className="h-4 w-4" /> Playoff teams</h4>
                    <TeamCollection teams={selectedSeason.playoffTeamsByConferenceId[conferenceId] ?? []} />
                  </div>
                  <div>
                    <h4 className="mb-2 flex items-center gap-2 font-barlow text-[10px] uppercase tracking-[0.18em] text-slate-500"><Crown className="h-4 w-4" /> Finals</h4>
                    <TeamCollection teams={selectedSeason.finalsTeamsByConferenceId[conferenceId] ?? []} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Medal className="h-5 w-5 text-amber-500" aria-hidden="true" />
            <h3 className="font-oswald text-xl text-slate-950">{selectedSeason.seasonName} award winners</h3>
          </div>
          {allAwards.length ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {allAwards.map((award) => {
                const team = teamsById.get(String(award.teamId));
                return (
                  <div key={award.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                    {team ? <TeamMark team={team} /> : null}
                    <div className="min-w-0">
                      <p className="truncate font-oswald text-base text-slate-900">{getAwardLabel(award.award)}</p>
                      <p className="truncate text-xs text-slate-500">{team?.ownerNickname ?? team?.name ?? "Winner"}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-400">No eligible league awards are recorded for this season yet.</p>
          )}
        </div>

        <div className="mt-6 flex justify-center">
          <Button
            onClick={() => {
              setSelectedSeasonId(selectedSeason.seasonId);
              router.push("/standings");
            }}
            className="rounded-xl px-6 font-barlow uppercase tracking-[0.14em]"
          >
            View {selectedSeason.seasonName} standings
          </Button>
        </div>
      </div>
    </section>
  );
}

export function ConferenceContest() {
  const { overall, seasons, teams, isLoading, error } = useConferenceContestData();
  const [mode, setMode] = useState<ConferenceContestRatingMode>("current");
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");

  useEffect(() => {
    if (seasons.length && !seasons.some((season) => season.seasonId === selectedSeasonId)) {
      setSelectedSeasonId(seasons[0]?.seasonId ?? "");
    }
  }, [seasons, selectedSeasonId]);

  const selectedSeason =
    seasons.find((season) => season.seasonId === selectedSeasonId) ?? seasons[0];
  const teamsById = useMemo(
    () => new Map(teams.map((team) => [String(team.id), team])),
    [teams],
  );

  if (isLoading) return <ConferenceContestSkeleton />;
  if (error) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-red-200 bg-red-50 p-8 text-center">
        <Info className="mx-auto h-8 w-8 text-red-500" aria-hidden="true" />
        <h1 className="mt-3 font-oswald text-2xl text-red-950">Conference Battle is unavailable</h1>
        <p className="mt-2 text-sm text-red-700">The historical results could not be loaded. Please try again shortly.</p>
      </div>
    );
  }
  if (!overall || !selectedSeason) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center">
        <Swords className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
        <h1 className="mt-3 font-oswald text-2xl text-slate-900">The battle is waiting to begin</h1>
        <p className="mt-2 text-sm text-slate-500">Two conferences and at least one season are needed to build the comparison.</p>
      </div>
    );
  }

  const rating = mode === "current" ? overall.currentRating : overall.allTimeRating;
  const left = overall.leftConference;
  const right = overall.rightConference;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-8">
      <header className="px-1 text-center sm:text-left">
        <p className="font-barlow text-xs uppercase tracking-[0.3em] text-slate-400">GSHL Conference Battle</p>
        <h1 className="mt-1 font-oswald text-4xl uppercase leading-none text-slate-950 sm:text-6xl">Who runs the league?</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-500 sm:mx-0 sm:text-base">
          Every matchup, playoff run, Cup and major award—distilled into one living head-to-head rating.
        </p>
      </header>

      <RatingHero left={left} right={right} rating={rating} mode={mode} onModeChange={setMode} />

      <section className="grid gap-4 sm:grid-cols-2">
        {COMPONENTS.map((component) => (
          <ComponentCard key={component.key} component={component} left={left} right={right} rating={rating} />
        ))}
      </section>

      <section className="rounded-[2rem] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-slate-50 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-amber-400 p-2.5 text-amber-950 shadow-lg"><Crown className="h-5 w-5" /></div>
          <div>
            <p className="font-barlow text-[10px] uppercase tracking-[0.24em] text-amber-700">Leadership edge</p>
            <h2 className="font-oswald text-2xl text-slate-950 sm:text-3xl">The awards that shape a conference</h2>
            <p className="mt-1 text-sm text-slate-500">Coach and GM of the Year each carry triple weight in the battle.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <LeadershipCard title="Coach of the Year" icon={Crown} leftAwards={overall.coachAwardsByConferenceId[left.id] ?? []} rightAwards={overall.coachAwardsByConferenceId[right.id] ?? []} left={left} right={right} teamsById={teamsById} />
          <LeadershipCard title="GM of the Year" icon={Shield} leftAwards={overall.gmAwardsByConferenceId[left.id] ?? []} rightAwards={overall.gmAwardsByConferenceId[right.id] ?? []} left={left} right={right} teamsById={teamsById} />
        </div>
      </section>

      <RatingTrend seasons={seasons} left={left} right={right} />
      <SeasonExplorer seasons={seasons} selectedSeason={selectedSeason} onSelect={setSelectedSeasonId} teamsById={teamsById} />

      <details className="group rounded-3xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-100 p-2 text-slate-500"><Info className="h-4 w-4" /></div>
            <div>
              <h2 className="font-oswald text-xl text-slate-950">How the rating works</h2>
              <p className="text-xs text-slate-500">A transparent, evidence-based comparison</p>
            </div>
          </div>
          <ChevronDown className="h-5 w-5 text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-slate-100 px-5 pb-6 pt-5 text-sm leading-6 text-slate-600 sm:px-6">
          <p>The rating always totals 100. Head-to-head results count for 35%, playoff performance for 30%, Cups for 20%, and league awards for 15%. Playoff performance blends wins (50%), Finals appearances (30%), and qualifying teams (20%).</p>
          <p className="mt-3">Coach of the Year and GM of the Year are worth three award points; other eligible league-wide awards are worth one. Conference trophies and All-Star selections are excluded, and the Cup is counted only once in its own category.</p>
          <p className="mt-3">Current form retains 85% of the previous season&apos;s weight - 1.00, 0.85, 0.72, 0.61 and so on - while All Time treats every season equally. Missing or undecided evidence stays neutral at 50-50.</p>
        </div>
      </details>
    </div>
  );
}
