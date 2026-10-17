"use client";

import Link from "next/link";
import { useStandingsData } from "@gshl-hooks";
import { calculateStandingsPoints } from "@gshl-utils";
import { SectionHeading } from "@gshl-components/ui/SectionHeading";

export function StandingsPreview({ seasonId }: { seasonId: string }) {
  const { groups, selectedSeason, isLoading } = useStandingsData({
    standingsType: "overall",
    seasonId,
    includeMatchups: false,
  });
  const teams = groups.flatMap((group) => group.teams).slice(0, 5);
  return (
    <section className="gshl-section" aria-labelledby="home-standings-heading">
      <SectionHeading
        id="home-standings-heading"
        title="League standings"
        href={`/standings?view=overall&season=${encodeURIComponent(seasonId)}`}
        action="Full table"
      />
      {isLoading ? (
        <p role="status" className="py-3 text-sm text-slate-500">
          Loading standings…
        </p>
      ) : !teams.length ? (
        <p className="py-3 text-sm text-slate-500">
          Standings will appear once teams are available.
        </p>
      ) : (
        <ol className="divide-y divide-slate-100">
          {teams.map((team, index) => (
            <li key={team.id}>
              <Link
                href={
                  team.ownerId
                    ? `/lockerroom?view=roster&owner=${encodeURIComponent(team.ownerId)}&season=${encodeURIComponent(seasonId)}`
                    : `/standings?view=overall&season=${encodeURIComponent(seasonId)}`
                }
                className="flex min-h-11 items-center gap-2 text-xs hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
              >
                <span className="w-5 text-center tabular-nums text-slate-500">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {team.name}
                </span>
                <span className="tabular-nums text-slate-500">
                  {team.seasonStats
                    ? `${team.seasonStats.teamW}-${team.seasonStats.teamL}${selectedSeason?.usesLegacyTies ? `-${team.seasonStats.teamT}` : ""}`
                    : "—"}
                </span>
                <span className="w-12 text-right font-semibold tabular-nums">
                  {team.seasonStats && selectedSeason
                    ? `${calculateStandingsPoints(team.seasonStats, selectedSeason)} pts`
                    : "—"}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
