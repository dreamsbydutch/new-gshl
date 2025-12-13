"use client";

import Image from "next/image";
import { cn } from "@gshl-utils";
import type { GSHLTeam, TeamSeasonStatLine } from "@gshl-types";

type SeededTeam = GSHLTeam & { seasonStats?: TeamSeasonStatLine };

type BracketMatchup = {
  title: string;
  homeLabel: string;
  awayLabel: string;
  homeTeam: SeededTeam | null;
  awayTeam: SeededTeam | null;
};

type ConferenceBracket = {
  conferenceTitle: string;
  matchups: BracketMatchup[];
};

function safeRank(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function sortByConferenceRank(teams: SeededTeam[]) {
  return [...teams].sort(
    (a, b) =>
      (safeRank(a.seasonStats?.conferenceRk) ?? 999) -
      (safeRank(b.seasonStats?.conferenceRk) ?? 999),
  );
}

function sortByOverallRank(teams: SeededTeam[]) {
  return [...teams].sort(
    (a, b) =>
      (safeRank(a.seasonStats?.overallRk) ?? 999) -
      (safeRank(b.seasonStats?.overallRk) ?? 999),
  );
}

function sortByWildcardRank(teams: SeededTeam[]) {
  return [...teams].sort(
    (a, b) =>
      (safeRank(a.seasonStats?.wildcardRk) ?? 999) -
      (safeRank(b.seasonStats?.wildcardRk) ?? 999),
  );
}

function TeamChip({ label, team }: { label: string; team: SeededTeam | null }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border bg-white px-2 py-2",
      )}
      title={team?.name ?? "TBD"}
    >
      <div className="w-12 text-xs font-semibold text-muted-foreground">
        {label}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="h-7 w-7 overflow-hidden rounded bg-slate-100">
          {team?.logoUrl ? (
            <Image src={team.logoUrl} alt="Team logo" width={28} height={28} />
          ) : null}
        </div>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">
          {team?.name ?? "TBD"}
        </div>
      </div>
      <div className="text-right text-xs text-muted-foreground">
        {team?.seasonStats?.teamW !== undefined &&
        team?.seasonStats?.teamL !== undefined
          ? `${team.seasonStats.teamW}-${team.seasonStats.teamL}`
          : ""}
      </div>
    </div>
  );
}

export function buildPlayoffBracket(
  teams: SeededTeam[],
  stats: TeamSeasonStatLine[],
): ConferenceBracket[] {
  console.log(stats);
  const playoffTeams = teams.map((t) => {
    const stat = stats.find((s) => s.gshlTeamId === t.id);
    return {
      ...t,
      seasonStats: stat ? { ...stat } : undefined,
    };
  });
  // Determine league-wide #1 seed
  const leagueSorted = sortByOverallRank(playoffTeams);
  const leagueOneSeed = leagueSorted[0] ?? null;

  // Determine wildcard ordering league-wide
  const wildcardPool = playoffTeams.filter(
    (t) =>
      t.seasonStats?.wildcardRk !== null &&
      t.seasonStats?.wildcardRk !== undefined,
  );
  const wildcardsSorted = sortByWildcardRank(wildcardPool);
  const topWildcard = wildcardsSorted[0] ?? null;
  const secondWildcard = wildcardsSorted[1] ?? null;

  // Conference champs (rank 1 within conference)
  const svTeams = playoffTeams.filter((t) => t.confAbbr === "SV");
  const hhTeams = playoffTeams.filter((t) => t.confAbbr === "HH");

  const svOneSeed = sortByConferenceRank(svTeams)[0] ?? null;
  const hhOneSeed = sortByConferenceRank(hhTeams)[0] ?? null;

  // The rule from you:
  // - top wildcard plays the lower-ranked #1 seed (i.e. worse overallRk among the two conf #1s)
  // - second wildcard plays the #1 overall league-wide seed
  const confOnes: SeededTeam[] = [svOneSeed, hhOneSeed].filter(
    Boolean,
  ) as SeededTeam[];
  const confOnesByOverall = sortByOverallRank(confOnes);
  const worstConfOne = confOnesByOverall[1] ?? null;

  const wildcardVsWorstOne: BracketMatchup = {
    title: "1 vs WC",
    homeLabel: "#1",
    awayLabel: "#4",
    homeTeam: worstConfOne,
    awayTeam: topWildcard,
  };

  const wildcardVsLeagueOne: BracketMatchup = {
    title: "1Ovr vs WC",
    homeLabel: "#1",
    awayLabel: "#4",
    homeTeam: leagueOneSeed,
    awayTeam: secondWildcard,
  };

  // Within each conference: 2 vs 3
  const buildTwoVsThree = (
    confTitle: string,
    confTeams: SeededTeam[],
  ): BracketMatchup => {
    const sorted = sortByConferenceRank(confTeams);
    return {
      title: "2 vs 3",
      homeLabel: "#2",
      awayLabel: "#3",
      homeTeam: sorted[1] ?? null,
      awayTeam: sorted[2] ?? null,
    };
  };

  // Map the “1 vs WC” matchup to a conference (the conference of the #1 seed involved)
  const matchConfKey = (oneSeed: SeededTeam | null) => oneSeed?.confAbbr ?? "";
  const oneWcConf = matchConfKey(wildcardVsWorstOne.homeTeam);

  const svMatchups: BracketMatchup[] = [];
  const hhMatchups: BracketMatchup[] = [];

  // Always include 2v3 in each conference.
  svMatchups.push(buildTwoVsThree("Sunview", svTeams));
  hhMatchups.push(buildTwoVsThree("Hickory Hotel", hhTeams));

  // Place the wildcard series under the appropriate conference.
  if (oneWcConf === "SV") svMatchups.unshift(wildcardVsWorstOne);
  if (oneWcConf === "HH") hhMatchups.unshift(wildcardVsWorstOne);

  // The #1 overall vs WC2 could be in either conference; put it under its team's conference.
  const leagueOneConf = matchConfKey(leagueOneSeed);
  if (leagueOneConf === "SV") svMatchups.unshift(wildcardVsLeagueOne);
  if (leagueOneConf === "HH") hhMatchups.unshift(wildcardVsLeagueOne);

  return [
    { conferenceTitle: "Sunview", matchups: svMatchups },
    { conferenceTitle: "Hickory Hotel", matchups: hhMatchups },
  ];
}

export function PlayoffBracket({
  teams,
  stats,
}: {
  teams: SeededTeam[];
  stats: TeamSeasonStatLine[];
}) {
  const brackets = buildPlayoffBracket(teams, stats);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-2">
      <div className="text-center font-varela text-xl font-bold">
        Playoff Bracket
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {brackets.map((conf) => (
          <div
            key={conf.conferenceTitle}
            className={cn(
              "rounded-xl border p-3 shadow-sm",
              conf.conferenceTitle === "Sunview" ? "bg-sunview-50" : "",
              conf.conferenceTitle === "Hickory Hotel" ? "bg-hotel-50" : "",
            )}
          >
            <div className="mb-2 text-center font-varela text-base font-bold">
              {conf.conferenceTitle}
            </div>
            <div className="flex flex-col gap-2">
              {conf.matchups.map((m) => (
                <div key={m.title} className="rounded-lg border bg-white p-2">
                  <div className="flex flex-col gap-2">
                    <TeamChip label={m.homeLabel} team={m.homeTeam} />
                    <TeamChip label={m.awayLabel} team={m.awayTeam} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
