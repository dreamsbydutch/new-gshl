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
  mode: "current" | "historical" | "future" = "current",
) {
  const abbreviationsForSeason = (value: string | string[]) =>
    getPlayerNhlAbbreviations(value).map((abbr) =>
      abbr === "PHX" ? "ARI" : abbr,
    );
  // The catalog includes alternate abbreviations and historical teams. Group
  // aliases under the canonical entry and show teams represented on rosters.
  const teamByAbbr = new Map<string, NhlRosterAnalyticsTeam>();
  for (const team of teams) {
    const abbr = abbreviationsForSeason(team.abbr)[0];
    if (abbr && (!teamByAbbr.has(abbr) || team.abbr === abbr))
      teamByAbbr.set(abbr, {
        ...team,
        abbr,
        name:
          abbr === "ARI" && seasonStartYear < 2014
            ? "Phoenix Coyotes"
            : abbr === "UTA" && seasonStartYear === 2024
              ? "Utah Hockey Club"
              : team.name,
      });
  }
  const seen = new Set<string>();
  const rows = players
    .filter((player) => {
      if (seen.has(player.id)) return false;
      seen.add(player.id);
      return true;
    })
    .map((player) => {
      const abbreviations = abbreviationsForSeason(player.nhlTeam);
      const team =
        abbreviations.length === 1
          ? teamByAbbr.get(abbreviations[0]!)
          : undefined;
      const contracts = player.contracts.filter(
        (contract) =>
          contract.startSeasonStartYear <= seasonStartYear &&
          contract.expirySeasonStartYear >= seasonStartYear,
      );
      const profile =
        mode === "historical" ? null : player.currentProfileContract;
      const currentProfile =
        profile &&
        profile.startSeasonStartYear <= seasonStartYear &&
        profile.expirySeasonStartYear >= seasonStartYear
          ? profile
          : null;
      const matching = currentProfile
        ? contracts.filter(
            (contract) =>
              contract.signingDate === currentProfile.signingDate &&
              contract.startSeasonStartYear ===
                currentProfile.startSeasonStartYear,
          )
        : [];
      const selected = currentProfile
        ? matching.length === 1
          ? matching[0]
          : matching.length === 0
            ? currentProfile
            : undefined
        : contracts.length === 1
          ? contracts[0]
          : undefined;
      const contract =
        !player.historyTruncated && selected
          ? normalizeNhlContract(selected, caps)
          : null;
      const reason = player.historyTruncated
        ? "Contract history needs review"
        : !selected && contracts.length > 1
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
        hasCommitment:
          contracts.length > 0 ||
          currentProfile !== null ||
          player.historyTruncated,
        playerName: player.playerName,
        position: player.position,
        teamId: team?.id ?? "unassigned",
        contract,
        usesProfileContract:
          selected === currentProfile && currentProfile !== null,
        reason: !team ? "Team assignment needs review" : reason,
        normalizedAav: contract?.normalizedAav ?? null,
        capHit:
          contract?.breakdown.find(
            (row) => row.seasonStartYear === seasonStartYear,
          )?.capHit ?? null,
      };
    })
    .filter((row) => mode !== "future" || row.hasCommitment);
  const representedTeams = new Set(
    players.flatMap((player) => getPlayerNhlAbbreviations(player.nhlTeam)),
  );
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
        calculatedPlayers: roster.filter((row) => row.normalizedAav !== null)
          .length,
        complete: roster.length > 0 && missing === 0,
        normalizedTotal: roster.reduce(
          (sum, row) => sum + (row.normalizedAav ?? 0),
          0,
        ),
        capHitTotal: roster.reduce((sum, row) => sum + (row.capHit ?? 0), 0),
        missingCapHits: roster.filter((row) => row.capHit === null).length,
      };
    })
    .filter(
      (team) =>
        team.roster.length > 0 ||
        (mode === "future" && representedTeams.has(team.abbr)),
    )
    .sort(
      (a, b) =>
        Number(b.complete) - Number(a.complete) ||
        b.normalizedTotal - a.normalizedTotal ||
        a.name.localeCompare(b.name),
    );
}
