import type {
  NhlRosterAnalyticsPlayer,
  NhlRosterAnalyticsTeam,
} from "../../types/nhl-contract-analytics";
import { getPlayerNhlAbbreviations } from "./player";
import { normalizeNhlContract } from "./normalized-nhl-contracts";

export function buildNormalizedNhlRosters(
  teams: readonly NhlRosterAnalyticsTeam[],
  players: readonly NhlRosterAnalyticsPlayer[],
  seasonStartYear: number,
  caps: Readonly<Record<number, number>>,
) {
  // The catalog includes alternate abbreviations and historical teams. Group
  // aliases under the canonical entry and show teams represented on rosters.
  const teamByAbbr = new Map<string, NhlRosterAnalyticsTeam>();
  for (const team of teams) {
    const abbr = getPlayerNhlAbbreviations(team.abbr)[0];
    if (abbr && (!teamByAbbr.has(abbr) || team.abbr === abbr))
      teamByAbbr.set(abbr, { ...team, abbr });
  }
  const seen = new Set<string>();
  const rows = players
    .filter((player) => {
      if (seen.has(player.id)) return false;
      seen.add(player.id);
      return true;
    })
    .map((player) => {
      const abbreviations = getPlayerNhlAbbreviations(player.nhlTeam);
      const team =
        abbreviations.length === 1
          ? teamByAbbr.get(abbreviations[0]!)
          : undefined;
      const contracts = player.contracts.filter(
        (contract) =>
          contract.startSeasonStartYear <= seasonStartYear &&
          contract.expirySeasonStartYear >= seasonStartYear,
      );
      const contract =
        !player.historyTruncated && contracts.length === 1
          ? normalizeNhlContract(contracts[0]!, caps)
          : null;
      const reason = player.historyTruncated
        ? "Contract history needs review"
        : contracts.length > 1
          ? "Overlapping contracts"
          : !contract
            ? "No current contract"
            : contract.termNeedsReview
              ? "Contract term needs review"
              : contract.missingCapYears.length
                ? "Missing season caps"
                : contract.missingSalaryYears.length
                  ? "Missing cap hits"
                  : null;
      return {
        id: player.id,
        playerName: player.playerName,
        position: player.position,
        teamId: team?.id ?? "unassigned",
        contract,
        reason: !team ? "Team assignment needs review" : reason,
        normalizedAav: contract?.normalizedAav ?? null,
        capHit:
          contract?.breakdown.find(
            (row) => row.seasonStartYear === seasonStartYear,
          )?.capHit ?? null,
      };
    });
  const allTeams = [
    ...teamByAbbr.values(),
    ...(rows.some((row) => row.teamId === "unassigned")
      ? [{ id: "unassigned", name: "Team assignment needs review", abbr: "" }]
      : []),
  ];
  return allTeams
    .map((team) => {
      const roster = rows
        .filter((row) => row.teamId === team.id)
        .sort(
          (a, b) =>
            (b.normalizedAav ?? -1) - (a.normalizedAav ?? -1) ||
            a.playerName.localeCompare(b.playerName),
        );
      const missing = roster.filter((row) => row.reason !== null).length;
      return {
        ...team,
        roster,
        missing,
        complete: roster.length > 0 && missing === 0,
        normalizedTotal: roster.reduce(
          (sum, row) => sum + (row.normalizedAav ?? 0),
          0,
        ),
        capHitTotal: roster.reduce((sum, row) => sum + (row.capHit ?? 0), 0),
        missingCapHits: roster.filter((row) => row.capHit === null).length,
      };
    })
    .filter((team) => team.roster.length > 0)
    .sort(
      (a, b) =>
        Number(b.complete) - Number(a.complete) ||
        b.normalizedTotal - a.normalizedTotal ||
        a.name.localeCompare(b.name),
    );
}
