import type { Contract, Player, Season } from "@gshl-types";
import { formatMoney } from "@gshl-utils";
import { PlayerContractRowSkeleton } from "@gshl-skeletons";
import Image from "next/image";
import { getExpiryStatusClass } from "../utils";
import { useNHLTeams } from "@gshl-hooks";

interface PlayerContractRowProps {
  contract: Contract;
  player: Player | undefined;
  currentSeason: Season;
}

export const PlayerContractRow = ({
  contract,
  player,
  currentSeason,
}: PlayerContractRowProps) => {
  // Hooks must be invoked unconditionally before any early returns
  const { data: nhlTeams } = useNHLTeams();
  if (!player) return <PlayerContractRowSkeleton contract={contract} />;

  const expiryStatus = String(contract.expiryStatus);
  const playerNhlAbbr = player.nhlTeam?.toString();
  const playerNhlTeam = nhlTeams.find((t) => t.abbreviation === playerNhlAbbr);

  const renderCapHitCell = (cutoffDate: Date, expiryYear: number) => {
    if (contract.capHitEndDate > cutoffDate) {
      return (
        <td className="border-b border-t border-gray-300 px-2 py-1 text-center text-xs">
          {formatMoney(contract.capHit)}
        </td>
      );
    }

    if (
      contract.capHitEndDate.getFullYear() === expiryYear &&
      contract.capHitEndDate.getMonth() === 3
    ) {
      return (
        <td
          className={`mx-2 my-1 rounded-xl border-b border-t border-gray-300 text-center text-2xs font-bold ${getExpiryStatusClass(expiryStatus)}`}
        >
          {expiryStatus === "Buyout" ? "" : expiryStatus}
        </td>
      );
    }

    return (
      <td className="border-b border-t border-gray-300 px-2 py-1 text-center text-xs"></td>
    );
  };

  return (
    <tr
      key={contract.id}
      className={`${expiryStatus === "Buyout" ? "text-gray-400" : "text-gray-800"}`}
    >
      <td className="sticky left-0 whitespace-nowrap border-b border-t border-gray-300 bg-gray-50 px-2 py-1 text-center text-xs">
        {player.fullName}
      </td>
      <td className="border-b border-t border-gray-300 px-2 py-1 text-center text-xs">
        {player.nhlPos.toString()}
      </td>
      <td className="border-b border-t border-gray-300 px-2 py-1 text-center text-xs">
        {playerNhlTeam?.logoUrl ? (
          <Image
            src={playerNhlTeam.logoUrl}
            alt={playerNhlTeam.fullName || playerNhlAbbr || "NHL Team"}
            className="mx-auto h-4 w-4"
            width={64}
            height={64}
          />
        ) : (
          <span className="text-2xs font-semibold">{playerNhlAbbr || "-"}</span>
        )}
      </td>
      {contract.startDate < currentSeason.signingEndDate &&
        contract.capHitEndDate > new Date() && (
          <td className="border-b border-t border-gray-300 px-2 py-1 text-center text-xs">
            {formatMoney(contract.capHit)}
          </td>
        )}
      {renderCapHitCell(new Date(2026, 3, 19), 2026)}
      {renderCapHitCell(new Date(2027, 3, 19), 2027)}
      {renderCapHitCell(new Date(2028, 3, 19), 2028)}
    </tr>
  );
};
