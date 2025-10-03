import { useAllPlayers, useNHLTeams } from "@gshl-hooks";
import { Table } from "@gshl-ui";
import { formatMoney, formatNumber } from "@gshl-utils";
import { NHLLogo } from "../ui/nhlLogo";
import type { Player, NHLTeam } from "@gshl-types";

export function FreeAgencyList() {
  const { data: players } = useAllPlayers();
  const { data: nhlTeams } = useNHLTeams();
  console.log("NHL Teams:", nhlTeams);
  if (!players)
    return (
      <div className="mt-8">
        <h2 className="mb-4 text-2xl font-bold">Free Agency List</h2>
        <p className="text-gray-500">Loading players...</p>
      </div>
    );

  const isTrue = (v: unknown): boolean =>
    v === true ||
    v === 1 ||
    (typeof v === "string" && ["true", "TRUE", "yes", "YES", "1"].includes(v));
  const isActiveFlag = (p: Pick<Player, "isActive">): boolean =>
    isTrue(p.isActive);
  const isSignableFlag = (p: Pick<Player, "isSignable">): boolean =>
    isTrue(p.isSignable);

  const freeAgents: Player[] = players
    .filter((p: Player) => isActiveFlag(p) && isSignableFlag(p))
    .sort(
      (a: Player, b: Player) => (b.overallRating ?? 0) - (a.overallRating ?? 0),
    );

  return (
    <div className="mt-8">
      <h2 className="mb-2 text-2xl font-bold">Free Agency List</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Showing {freeAgents.length} active signable players (RFAs & UFAs).
      </p>
      <Table className="divide-y divide-gray-200 text-center">
        <thead>
          <tr>
            <th>Tm</th>
            <th>Player</th>
            <th>Pos</th>
            <th>Age</th>
            <th>2024-25 Rating</th>
            <th>Salary</th>
          </tr>
        </thead>
        <tbody>
          {freeAgents.map((player: Player) => (
            <tr key={player.id} className="py-2">
              <td>
                <NHLLogo
                  team={nhlTeams.find(
                    (t: NHLTeam) =>
                      t.abbreviation === player.nhlTeam.toString(),
                  )}
                />
              </td>
              <td className="whitespace-nowrap">{player.fullName}</td>
              <td className="whitespace-nowrap">{player.nhlPos.toString()}</td>
              <td className="whitespace-nowrap">{player.age}</td>
              <td className="whitespace-nowrap">
                {(+formatNumber(player.seasonRating ?? 0, 2)).toFixed(2)}
              </td>
              <td className="whitespace-nowrap">
                {formatMoney(+(player.salary ?? 0) * 1.25, true)}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
