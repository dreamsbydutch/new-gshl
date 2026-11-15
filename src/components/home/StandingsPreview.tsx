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
    <section className="min-w-0" aria-labelledby="home-standings-heading">
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
        <div className="grid grid-cols-2 gap-x-3 sm:gap-x-5">
          {groups.map((group) => (
            <div key={group.title} className="min-w-0">
              <h3
                title={group.title}
                className="truncate border-b border-slate-100 py-1 text-xs font-semibold text-slate-500"
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
                        className="flex min-h-11 items-center justify-between gap-2 px-1 text-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                      >
                        {team.logoUrl ? (
                          <Image
                            src={team.logoUrl}
                            alt=""
                            width={28}
                            height={28}
                            className="h-7 w-7 shrink-0 object-contain"
                          />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="text-xs font-semibold"
                          >
                            {team.abbr ?? teamName.slice(0, 3)}
                          </span>
                        )}
                        <span className="font-mono text-xs tabular-nums text-slate-700">
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
