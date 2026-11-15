"use client";

import Image from "next/image";
import Link from "next/link";
import { useStandingsData } from "@gshl-hooks";
import { SectionHeading } from "@gshl-components/ui/SectionHeading";

export function StandingsPreview({ seasonId }: { seasonId: string }) {
  const { groups, selectedSeason, isLoading } = useStandingsData({
    standingsType: "conference",
    seasonId,
    includeMatchups: false,
  });
  const standingsHref =
    "/standings?view=conference&season=" + encodeURIComponent(seasonId);
  return (
    <section className="gshl-section" aria-labelledby="home-standings-heading">
      <SectionHeading
        id="home-standings-heading"
        title="Standings"
        href={standingsHref}
        action="Full standings"
      />
      {isLoading ? (
        <p role="status" className="py-2 text-sm text-slate-500">
          Loading standings...
        </p>
      ) : !groups.some((group) => group.teams.length) ? (
        <p className="py-2 text-sm text-slate-500">No standings yet.</p>
      ) : (
        <div className="mx-auto grid w-full max-w-sm grid-cols-2 gap-x-2">
          {groups.map((group) => (
            <div key={group.title} className="min-w-0">
              <h3
                title={group.title}
                className="truncate border-b border-slate-100 py-1 text-center text-sm font-semibold text-slate-600"
              >
                {group.title.replace(/ Conference$/i, "")}
              </h3>
              <ol
                aria-label={group.title}
                className="divide-y divide-slate-100"
              >
                {group.teams.map((team, index) => {
                  const teamName = team.name ?? team.abbr ?? "Team";
                  const record = team.seasonStats
                    ? String(team.seasonStats.teamW ?? 0) +
                      "-" +
                      String(team.seasonStats.teamL ?? 0) +
                      (selectedSeason?.usesLegacyTies
                        ? "-" + String(team.seasonStats.teamT ?? 0)
                        : "")
                    : "-";
                  const label =
                    teamName +
                    ", " +
                    record +
                    ", " +
                    String(index + 1) +
                    " in " +
                    group.title;
                  return (
                    <li key={team.id}>
                      <Link
                        href={
                          team.ownerId
                            ? "/lockerroom?view=roster&owner=" +
                              encodeURIComponent(team.ownerId) +
                              "&season=" +
                              encodeURIComponent(seasonId)
                            : standingsHref
                        }
                        title={label}
                        aria-label={label}
                        className="flex min-h-11 items-center justify-center gap-3 px-1 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                      >
                        {team.logoUrl ? (
                          <Image
                            src={team.logoUrl}
                            alt=""
                            width={32}
                            height={32}
                            className="h-8 w-8 shrink-0 object-contain"
                          />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="flex h-8 w-8 shrink-0 items-center justify-center text-xs font-semibold"
                          >
                            {team.abbr ?? teamName.slice(0, 3)}
                          </span>
                        )}
                        <span className="min-w-14 text-center text-base font-semibold tabular-nums text-slate-800">
                          {record}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
