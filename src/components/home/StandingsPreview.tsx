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
  const rankedTeams = groups
    .flatMap((group) => group.teams)
    .filter(
      (team) =>
        (team.seasonStats?.overallRk ?? 0) > 0 &&
        (team.seasonStats?.conferenceRk ?? 0) > 0,
    );
  const wildcardIds = new Set(
    rankedTeams
      .filter((team) => Number(team.seasonStats?.conferenceRk) > 3)
      .sort(
        (a, b) =>
          Number(a.seasonStats?.overallRk) - Number(b.seasonStats?.overallRk),
      )
      .slice(0, 2)
      .map((team) => team.id),
  );
  const hasResults = rankedTeams.some(
    (team) =>
      (team.seasonStats?.teamW ?? 0) +
        (team.seasonStats?.teamL ?? 0) +
        (team.seasonStats?.teamT ?? 0) >
      0,
  );
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
        <>
          <p className="py-1 text-center text-[10px] text-slate-500">
            <span
              aria-hidden="true"
              className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-100"
            />
            Playoff position
          </p>
          <div className="mx-auto grid w-full max-w-sm grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] gap-x-1">
            <div aria-hidden="true" className="col-start-2 row-start-1">
              <div className="border-b border-slate-100 py-1 text-sm">
                &nbsp;
              </div>
              <ol className="divide-y divide-slate-100">
                {["1st", "2nd", "3rd", "4th", "5th", "6th", "7th"].map(
                  (place) => (
                    <li
                      key={place}
                      className="box-content flex h-11 items-center justify-center text-xs font-semibold text-slate-600"
                    >
                      <span className="rounded bg-slate-100 px-1 py-1">
                        {place}
                      </span>
                    </li>
                  ),
                )}
              </ol>
            </div>
            {groups.map((group, groupIndex) => (
              <div
                key={group.title}
                className={`row-start-1 min-w-0 ${groupIndex === 0 ? "col-start-1" : "col-start-3"}`}
              >
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
                    const conferenceRank = team.seasonStats?.conferenceRk ?? 0;
                    const qualifies =
                      hasResults &&
                      ((conferenceRank > 0 && conferenceRank <= 3) ||
                        wildcardIds.has(team.id));
                    const label =
                      teamName +
                      ", " +
                      record +
                      ", " +
                      String(index + 1) +
                      " in " +
                      group.title +
                      (qualifies ? ", in playoff position" : "");
                    return (
                      <li
                        key={team.id}
                        className={qualifies ? "bg-emerald-50" : undefined}
                      >
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
        </>
      )}
    </section>
  );
}
