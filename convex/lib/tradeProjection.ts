import type { Doc } from "../_generated/dataModel";
import type { LeagueTradeSummary } from "../../src/lib/types/trades";

/** Contract preimages and the creating user's identity stay in the private ledger. */
export function projectTrade(trade: Doc<"trades">): LeagueTradeSummary {
  return {
    id: trade._id,
    date: trade.effectiveDate,
    teamA: {
      id: trade.teamAId,
      name: trade.teamAName,
      logoUrl: trade.teamALogoUrl,
    },
    teamB: {
      id: trade.teamBId,
      name: trade.teamBName,
      logoUrl: trade.teamBLogoUrl,
    },
    players: trade.players.map(
      ({ playerId, playerName, fromTeamId, toTeamId }) => ({
        playerId,
        playerName,
        fromTeamId,
        toTeamId,
      }),
    ),
    picks: trade.picks.map((p) => ({ ...p })),
    notes: trade.notes,
  };
}
