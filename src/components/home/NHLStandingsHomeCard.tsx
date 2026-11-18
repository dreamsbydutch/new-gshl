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
            {!data.isPreseason && (
              <span className="mr-2">
                <span
                  aria-hidden="true"
                  className="mr-1 inline-block h-2 w-2 rounded-sm bg-slate-200"
                />
                Playoff position
              </span>
            )}
            {data.isPreseason ? "Preseason · " : ""}PTS
          </p>
          <div className="mx-auto grid max-w-md grid-cols-[1fr_1fr_1.5rem_1fr_1fr] sm:grid-cols-[1fr_1fr_2rem_1fr_1fr]">
            <div className="col-span-2 border-b text-center text-[10px] font-semibold">
              Eastern
            </div>
            <div className="col-span-2 col-start-4 border-b text-center text-[10px] font-semibold">
              Western
            </div>
            <div aria-hidden="true" className="col-start-3 row-start-2">
              <div className="invisible border-b py-1 text-[10px]">Rank</div>
              {["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"].map(
                (rank) => (
                  <div
                    key={rank}
                    className="flex h-8 items-center justify-center text-[10px] font-semibold text-slate-600 sm:h-10"
                  >
                    <span className="rounded bg-slate-100 px-0.5">
                      {data.isPreseason ? "-" : rank}
                    </span>
                  </div>
                ),
              )}
            </div>
            {divisions.map(({ name, teams }, i) => (
              <section
                key={name}
                aria-label={`${name} division`}
                className="row-start-2 min-w-0"
                style={{ gridColumn: i < 2 ? i + 1 : i + 2 }}
              >
                <h3
                  className="truncate border-b border-slate-100 py-1 text-center text-[10px] font-semibold text-slate-600"
                  title={name}
                >
                  {name}
                </h3>
                <ol className="divide-y divide-slate-100">
                  {teams.map((team) => {
                    const qualifies =
                      !data.isPreseason &&
                      ((team.divisionSequence > 0 &&
                        team.divisionSequence <= 3) ||
                        (team.wildcardSequence != null &&
                          team.wildcardSequence > 0 &&
                          team.wildcardSequence <= 2));
                    return (
                      <li
                        key={team.teamAbbrev.default}
                        title={`${team.teamName.default}: ${team.points} points${qualifies ? ", in playoff position" : ""}`}
                        className={`grid h-8 grid-cols-[1.5rem_1.25rem] items-center justify-center gap-1 text-[10px] tabular-nums sm:h-10 sm:grid-cols-[2rem_1.25rem] ${qualifies ? "bg-slate-100" : ""}`}
                      >
                        <span className="sr-only">
                          {team.teamName.default},{" "}
                          {data.isPreseason
                            ? "preseason"
                            : `division place ${team.divisionSequence}`}
                          , {team.points} points
                          {qualifies && ", in playoff position"}
                        </span>
                        <span aria-hidden="true">
                          <NHLLogo
                            team={{
                              name: team.teamAbbrev.default,
                              logoUrl: "",
                            }}
                            size={32}
                            className="!mx-0 !h-6 !w-6 sm:!h-8 sm:!w-8"
                          />
                        </span>
                        <span
                          aria-hidden="true"
                          className="text-right font-semibold text-slate-800"
                        >
                          {team.points}
                        </span>
                      </li>
                    );
                  })}
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
