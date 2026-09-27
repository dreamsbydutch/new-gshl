"use client";

import { useNHLStandingsData } from "@gshl-hooks/features/useNHLStandingsData";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { StandingsSkeleton } from "@gshl-skeletons";
import {
  formatNHLUpdatedAt,
  NHL_DIVISION_ORDER,
} from "@gshl-utils/features/nhl";

export function NHLStandings() {
  const { data, seasonId, isLoading, error, retry } = useNHLStandingsData();
  if (isLoading) return <StandingsSkeleton />;
  const season = seasonId?.toString();
  const divisions = [
    ...new Set(data?.standings.map((team) => team.divisionName) ?? []),
  ].sort((a, b) => {
    const order = (name: string) => {
      const index = NHL_DIVISION_ORDER.findIndex(
        (division) => division === name,
      );
      return index === -1 ? 4 : index;
    };
    return order(a) - order(b);
  });
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-3 py-6">
      <header className="text-center">
        <h2 className="text-xl font-bold">NHL Standings</h2>
        <p className="text-sm text-gray-500">
          NHL season
          {season ? ` · ${season.slice(0, 4)}–${season.slice(4)}` : ""}
        </p>
        <p className="text-xs text-gray-500">
          {data?.standings[0]?.date ? `As of ${data.standings[0].date} · ` : ""}
          Refreshes daily
        </p>
        {data && (
          <p className="text-xs text-gray-500">
            Last updated:{" "}
            <time dateTime={new Date(data.updatedAt).toISOString()}>
              {formatNHLUpdatedAt(data.updatedAt)}
            </time>
          </p>
        )}
      </header>
      {data?.isPreseason && (
        <p className="text-center text-xs text-gray-500">
          Preseason · Regular-season totals start at zero.
        </p>
      )}
      {error && (
        <p role="alert" className="text-center text-sm">
          {error}{" "}
          <button className="underline" onClick={retry}>
            Retry
          </button>
        </p>
      )}
      {data && !data.standings.length && (
        <p className="text-center text-sm text-gray-500">
          NHL standings are not available yet.
        </p>
      )}
      {divisions.map((division) => {
        const teams = data!.standings
          .filter((team) => team.divisionName === division)
          .sort((a, b) => a.divisionSequence - b.divisionSequence);
        return (
          <section
            key={division}
            className="overflow-hidden rounded-lg border bg-white"
          >
            <h3 className="bg-gray-100 px-4 py-3 font-bold">
              {division}{" "}
              <span className="text-xs font-normal text-gray-500">
                · {teams[0]?.conferenceName}
              </span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm tabular-nums">
                <caption className="sr-only">
                  {division} NHL standings. OT means overtime and shootout
                  losses.
                </caption>
                <thead className="text-xs text-gray-500">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left">
                      Team
                    </th>
                    {["GP", "W", "L", "OT", "PTS", "+/−"].map((label) => (
                      <th scope="col" className="px-2 py-2" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => (
                    <tr key={team.teamAbbrev.default} className="border-t">
                      <th
                        scope="row"
                        className="whitespace-nowrap px-3 py-3 text-left font-normal"
                      >
                        <span className="inline-flex items-center gap-2">
                          <span className="w-3 text-gray-400">
                            {data?.isPreseason ? "–" : team.divisionSequence}
                          </span>
                          <NHLLogo
                            team={{
                              name: team.teamAbbrev.default,
                              logoUrl: "",
                            }}
                            size={24}
                            className="!mx-0 shrink-0"
                          />
                          <span
                            className="sm:hidden"
                            title={team.teamName.default}
                          >
                            {team.teamAbbrev.default}
                          </span>
                          <span className="hidden sm:inline">
                            {team.teamName.default}
                          </span>
                        </span>
                      </th>
                      <td className="px-2">{team.gamesPlayed}</td>
                      <td className="px-2">{team.wins}</td>
                      <td className="px-2">{team.losses}</td>
                      <td className="px-2">{team.otLosses}</td>
                      <td className="px-2 font-bold">{team.points}</td>
                      <td className="px-2">
                        {team.goalDifferential > 0 ? "+" : ""}
                        {team.goalDifferential}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      <p className="text-center text-xs text-gray-500">
        Source:{" "}
        <a
          className="underline"
          href="https://www.nhl.com/standings"
          target="_blank"
          rel="noreferrer"
        >
          NHL
        </a>{" "}
        · GP: games played · OT: overtime/shootout losses
      </p>
    </div>
  );
}
