export type ContractSigningSeason = {
  id: string;
  year: number | string;
};

export type ContractSigningTeam = {
  id: string;
  seasonId: string;
  franchiseId: string;
};

export type ContractSigningPick = {
  id: string;
  seasonId: string;
  gshlTeamId: string | null | undefined;
  round: number | string;
  pick?: number | string | null;
  playerId: string | null | undefined;
  isSigning: boolean;
};

export type ContractSigningAssignment = {
  seasonId: string;
  teamId: string;
  pickId: string;
};

/**
 * Reserves each covered season's lowest available pick for a signed player.
 */
export function resolveContractSigningAssignments(options: {
  signingSeasonId: string;
  contractLength: number;
  franchiseId: string;
  seasons: readonly ContractSigningSeason[];
  teams: readonly ContractSigningTeam[];
  picks: readonly ContractSigningPick[];
}): ContractSigningAssignment[] {
  const orderedSeasons = [...options.seasons].sort(
    (left, right) =>
      Number(left.year) - Number(right.year) || left.id.localeCompare(right.id),
  );
  const signingSeasonIndex = orderedSeasons.findIndex(
    (season) => season.id === options.signingSeasonId,
  );
  if (signingSeasonIndex < 0 || options.contractLength < 1) {
    throw new Error("The contract signing season could not be resolved");
  }

  const coveredSeasons = orderedSeasons.slice(
    signingSeasonIndex + 1,
    signingSeasonIndex + 1 + options.contractLength,
  );
  if (coveredSeasons.length !== options.contractLength) {
    throw new Error("The required future seasons have not been configured");
  }

  return coveredSeasons.map((season) => {
    const team = options.teams.find(
      (candidate) =>
        candidate.seasonId === season.id &&
        candidate.franchiseId === options.franchiseId,
    );
    if (!team) {
      throw new Error(
        `No team is configured for the ${season.id} signing season`,
      );
    }

    const pick = options.picks
      .filter(
        (candidate) =>
          candidate.seasonId === season.id &&
          candidate.gshlTeamId === team.id &&
          !candidate.playerId &&
          !candidate.isSigning,
      )
      .sort(
        (left, right) =>
          Number(right.round) - Number(left.round) ||
          Number(right.pick) - Number(left.pick) ||
          right.id.localeCompare(left.id),
      )[0];
    if (!pick) {
      throw new Error(
        `No available draft pick remains for the ${season.id} signing season`,
      );
    }

    return { seasonId: season.id, teamId: team.id, pickId: pick.id };
  });
}
