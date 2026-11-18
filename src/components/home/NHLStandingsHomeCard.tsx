"use client";

import { useNHLHomeStandings } from "@gshl-hooks/features/useNHLHomeStandings";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { SectionHeading } from "@gshl-components/ui/SectionHeading";
import { NHLStandingsHomeCardSkeleton } from "@gshl-components/skeletons/HomeSkeleton";
import { formatNHLUpdatedAt } from "@gshl-utils/features/nhl";

export function NHLStandingsHomeCard({
  seasonId,
  seasonYear,
}: {
  seasonId: string;
  seasonYear: string | number;
}) {
  const { data, divisions, isLoading, error, retry } =
    useNHLHomeStandings(seasonYear);
  if (isLoading) return <NHLStandingsHomeCardSkeleton />;
  return (
    <section
      aria-labelledby="nhl-standings-home-heading"
      className="gshl-section"
    >
      <SectionHeading
        id="nhl-standings-home-heading"
        title="NHL standings"
        href={`/standings?view=nhl&season=${encodeURIComponent(seasonId)}`}
        action="Full NHL standings"
      />
      {error && (
        <p role="alert" className="py-2 text-xs text-slate-600">
          {error}{" "}
          <button
            type="button"
            onClick={retry}
            className="min-h-11 underline focus-visible:ring-2 focus-visible:ring-slate-500"
          >
            Retry
          </button>
        </p>
      )}
      {data?.standings.length ? (
        <>
          <p className="py-1 text-center text-[10px] text-slate-500">
            {data.isPreseason ? "Preseason · " : ""}PTS
          </p>
          <div className="mx-auto grid max-w-md grid-cols-4 divide-x divide-slate-100">
            {divisions.map(({ name, teams }) => (
              <section
                key={name}
                aria-label={`${name} division`}
                className="min-w-0"
              >
                <h3
                  className="truncate border-b border-slate-100 py-1 text-center text-[10px] font-semibold text-slate-600"
                  title={name}
                >
                  {name}
                </h3>
                <ol className="divide-y divide-slate-100">
                  {teams.map((team) => (
                    <li
                      key={team.teamAbbrev.default}
                      title={`${team.teamName.default}: ${team.points} points`}
                      className="grid min-h-8 grid-cols-[0.5rem_1.25rem_1.25rem] items-center justify-center gap-1 text-[10px] tabular-nums"
                    >
                      <span className="sr-only">
                        {team.teamName.default},{" "}
                        {data.isPreseason
                          ? "preseason"
                          : `division place ${team.divisionSequence}`}
                        , {team.points} points
                      </span>
                      <span aria-hidden="true" className="text-slate-400">
                        {data.isPreseason ? "–" : team.divisionSequence}
                      </span>
                      <span aria-hidden="true">
                        <NHLLogo
                          team={{ name: team.teamAbbrev.default, logoUrl: "" }}
                          size={20}
                          className="!mx-0"
                        />
                      </span>
                      <span
                        aria-hidden="true"
                        className="text-right font-semibold text-slate-800"
                      >
                        {team.points}
                      </span>
                    </li>
                  ))}
                </ol>
                {!teams.length && (
                  <p className="py-2 text-center text-[10px] text-slate-500">
                    No teams
                  </p>
                )}
              </section>
            ))}
          </div>
          <p className="pt-1 text-center text-[10px] text-slate-500">
            Updated {formatNHLUpdatedAt(data.updatedAt)}
          </p>
        </>
      ) : !error ? (
        <p className="py-4 text-center text-xs text-slate-500">
          NHL standings are not available yet.
        </p>
      ) : null}
    </section>
  );
}
