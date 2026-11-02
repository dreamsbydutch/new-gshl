"use client";

import { useNHLLeadersData } from "@gshl-hooks/features/useNHLLeadersData";
import { formatNHLLeaderStat } from "@gshl-utils/features/nhl-leaders";
import type { NHLLeader, NHLLeaderStat } from "@gshl-lib/types/nhl-leaders";

const SKATER_STATS: NHLLeaderStat[] = [
  "GP",
  "G",
  "A",
  "P",
  "SOG",
  "PPP",
  "HIT",
  "BLK",
  "TOI",
];
const GOALIE_STATS: NHLLeaderStat[] = [
  "GP",
  "W",
  "GA",
  "GAA",
  "SV",
  "SA",
  "SVP",
  "TOI",
];
const STAT_NAMES: Record<NHLLeaderStat, string> = {
  GP: "Games played",
  G: "Goals",
  A: "Assists",
  P: "Points",
  SOG: "Shots on goal",
  PPP: "Power-play points",
  HIT: "Hits",
  BLK: "Blocked shots",
  TOI: "Total time on ice (minutes:seconds)",
  W: "Wins",
  GA: "Goals against",
  GAA: "Goals-against average",
  SV: "Saves",
  SA: "Shots against",
  SVP: "Save percentage",
};

function LeaderTable({
  title,
  players,
  stats,
  sort,
  onSort,
  loading,
  unavailable,
}: {
  title: string;
  players: NHLLeader[];
  stats: NHLLeaderStat[];
  sort: NHLLeaderStat;
  onSort: (stat: NHLLeaderStat) => void;
  loading: boolean;
  unavailable: boolean;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border bg-white">
      <h3 className="bg-gray-100 px-4 py-3 font-bold">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-right text-xs tabular-nums">
          <caption className="sr-only">
            {title}. Click a stat to show its season leaders. GA and GAA rank
            lowest first; other stats rank highest first. TOI is total season
            time.
          </caption>
          <thead className="text-gray-500">
            <tr>
              <th scope="col" className="px-2 py-2">
                #
              </th>
              <th scope="col" className="px-2 py-2 text-left">
                Player
              </th>
              <th scope="col" className="px-2 py-2 text-left">
                Team
              </th>
              {stats.map((stat) => (
                <th
                  scope="col"
                  key={stat}
                  aria-sort={
                    sort === stat
                      ? stat === "GA" || stat === "GAA"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    onClick={() => onSort(stat)}
                    title={STAT_NAMES[stat]}
                    aria-label={`Sort by ${STAT_NAMES[stat]}`}
                    className={`px-2 py-3 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 ${sort === stat ? "font-bold text-gray-950 underline" : ""}`}
                  >
                    {stat}
                    {sort === stat
                      ? stat === "GA" || stat === "GAA"
                        ? " ↑"
                        : " ↓"
                      : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((player, index) => (
              <tr key={player.id} className="border-t hover:bg-gray-50">
                <td className="px-2 py-2 text-gray-400">{index + 1}</td>
                <th scope="row" className="px-2 py-2 text-left font-medium">
                  {player.name}
                </th>
                <td className="px-2 py-2 text-left text-gray-500">
                  {player.team}
                </td>
                {stats.map((stat) => (
                  <td
                    key={stat}
                    className={`px-2 py-2 ${sort === stat ? "font-bold text-gray-950" : ""}`}
                  >
                    {formatNHLLeaderStat(stat, player.stats[stat])}
                  </td>
                ))}
              </tr>
            ))}
            {!players.length && (
              <tr>
                <td
                  colSpan={stats.length + 3}
                  className="px-4 py-8 text-center text-gray-500"
                  role="status"
                >
                  {loading
                    ? "Loading player leaders…"
                    : unavailable
                      ? "Player leaders are temporarily unavailable."
                      : "No player stats available for this season yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function NHLPlayerLeaders({ seasonId }: { seasonId?: number }) {
  const {
    skaters,
    goalies,
    skaterSort,
    goalieSort,
    setSkaterSort,
    setGoalieSort,
    isLoading,
    error,
    retry,
  } = useNHLLeadersData(seasonId);
  return (
    <section aria-labelledby="nhl-leaders-heading" className="space-y-3">
      <div>
        <h2 id="nhl-leaders-heading" className="text-lg font-bold">
          NHL player leaders
        </h2>
        <p className="text-xs text-gray-500">
          Regular season · Select a stat to see its top players. TOI shows total
          season minutes.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm">
          {error}{" "}
          <button type="button" className="underline" onClick={retry}>
            Retry player leaders
          </button>
        </p>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <LeaderTable
          title="Top 100 skaters"
          players={skaters}
          stats={SKATER_STATS}
          sort={skaterSort}
          onSort={setSkaterSort}
          loading={isLoading}
          unavailable={Boolean(error)}
        />
        <LeaderTable
          title="Top 20 goalies"
          players={goalies}
          stats={GOALIE_STATS}
          sort={goalieSort}
          onSort={setGoalieSort}
          loading={isLoading}
          unavailable={Boolean(error)}
        />
      </div>
    </section>
  );
}
