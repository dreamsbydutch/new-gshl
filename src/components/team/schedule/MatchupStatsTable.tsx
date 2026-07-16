"use client";

import type { MatchupStatsTableProps } from "@gshl-types";
import { TeamStatsRow } from "./TeamStatsRow";

function StatHeadersRow({ headers }: { headers: string[] }) {
  return (
    <tr className="rounded-lg bg-gray-100 text-gray-600">
      {headers.map((header, index) => (
        <td
          key={`${header}-${index}`}
          className={`py-1 text-center text-[10px] ${index > 1 ? "min-w-4" : ""}`}
        >
          {header}
        </td>
      ))}
    </tr>
  );
}

export function MatchupStatsTable({
  selectedTeam,
  selectedTeamStats,
  selectedTeamScore,
  opponentTeam,
  opponentStats,
  opponentScore,
  categories,
}: MatchupStatsTableProps) {
  const headers = ["", "Score", ...categories.map((category) => category.label)];

  return (
    <div className="mx-auto w-5/6 py-1.5">
      <table className="w-full text-xs">
        <tbody>
          <TeamStatsRow
            team={selectedTeam}
            teamStats={selectedTeamStats}
            opponentStats={opponentStats}
            teamScore={selectedTeamScore}
            opponentScore={opponentScore}
            categories={categories}
          />
          <StatHeadersRow headers={headers} />
          <TeamStatsRow
            team={opponentTeam}
            teamStats={opponentStats}
            opponentStats={selectedTeamStats}
            teamScore={opponentScore}
            opponentScore={selectedTeamScore}
            categories={categories}
          />
        </tbody>
      </table>
    </div>
  );
}
