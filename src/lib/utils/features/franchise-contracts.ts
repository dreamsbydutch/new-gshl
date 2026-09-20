import type {
  Contract,
  FranchiseContractHistoryRowType,
  FranchiseContractView,
  FranchiseContractViewInput,
  GSHLTeam,
  Player,
  Season,
} from "@gshl-types";
import { formatDate, toNumber } from "../core";
import { ContractStatus } from "../domain/constants";
import {
  getContractDedupeKey,
  shouldShowExpiredFreeAgentContract,
} from "../domain/contracts";
import {
  calculateContractCapSpaceWindow,
  getDateYear,
  getSeasonEndYear,
  groupContractsByPlayer,
} from "./contract-table";

/** Selects one owner's contracts, keeping the first copy of each persisted identity. */
export function selectOwnerContracts(
  contracts: readonly Contract[],
  ownerId: string | null | undefined,
): Contract[] {
  if (!ownerId) return [];
  return dedupeContracts(
    contracts.filter((contract) => String(contract.ownerId) === ownerId),
  );
}

/** Projects all franchise contract views from fetched data without changing its inputs. */
export function buildFranchiseContractView(
  input: FranchiseContractViewInput,
): FranchiseContractView {
  const {
    ownerContracts,
    currentSeason,
    currentTeam,
    teams,
    allTeams,
    players,
    relatedPlayers,
    seasons,
    draftPicks,
    playerNhlSalaryRows = [],
    referenceDate = new Date(),
  } = input;
  const currentFranchiseId = currentTeam?.franchiseId
    ? String(currentTeam.franchiseId)
    : null;
  const activeSeasonEndYear = getSeasonEndYear(currentSeason);
  const teamPool = allTeams ?? teams ?? [];
  const playerById = new Map(
    [...(players ?? []), ...(relatedPlayers ?? [])]
      .filter((player) => player?.id)
      .map((player) => [player.id, player]),
  );
  const contractPlayers = [...playerById.values()];
  const franchiseById = new Map(
    teamPool
      .filter((team) => team.franchiseId)
      .map((team) => [String(team.franchiseId), team]),
  );
  const teamById = new Map(
    teamPool.filter((team) => team.id).map((team) => [String(team.id), team]),
  );
  const seasonById = new Map(
    (seasons ?? []).map((season) => [String(season.id), season]),
  );
  const relevantPlayerIdSet = new Set(
    ownerContracts
      .map((contract) => String(contract.playerId ?? ""))
      .filter(Boolean),
  );
  const relevantSeasonEndYears = new Set(
    ownerContracts.flatMap((contract) =>
      getContractActiveSeasonEndYears(contract, seasonById),
    ),
  );
  const nhlSalaryByPlayerSeasonEndYear = new Map<string, number>();
  for (const row of playerNhlSalaryRows) {
    const playerId = String(row.playerId ?? "");
    if (!playerId || !relevantPlayerIdSet.has(playerId)) continue;
    const seasonEndYear = getSeasonEndYear(
      seasonById.get(String(row.seasonId)),
    );
    const salary = toNumber(row.salary, Number.NaN);
    if (
      seasonEndYear === null ||
      !relevantSeasonEndYears.has(seasonEndYear) ||
      !Number.isFinite(salary)
    )
      continue;
    nhlSalaryByPlayerSeasonEndYear.set(
      getPlayerSeasonValueKey(playerId, seasonEndYear),
      salary,
    );
  }
  const currentContracts = ownerContracts
    .filter((contract) =>
      shouldDisplayInCurrentContracts(
        contract,
        currentSeason,
        activeSeasonEndYear,
        seasons,
        referenceDate,
      ),
    )
    .sort((a, b) => toNumber(b.capHit, 0) - toNumber(a.capHit, 0));
  const activeCurrentContracts = ownerContracts.filter((contract) =>
    hasCurrentOrFutureCapImpact(contract, activeSeasonEndYear),
  );
  const buyoutContracts = ownerContracts
    .filter((contract) => contract.expiryStatus === ContractStatus.BUYOUT)
    .map((contract) => ({
      ...contract,
      isActiveBuyout: hasCurrentOrFutureCapImpact(
        contract,
        activeSeasonEndYear,
      ),
    }))
    .sort((a, b) => {
      if (a.isActiveBuyout !== b.isActiveBuyout) {
        return a.isActiveBuyout ? -1 : 1;
      }
      return toNumber(b.capHit, 0) - toNumber(a.capHit, 0);
    });
  const contractGroups = groupContractsByPlayer(currentContracts);
  const capSpaceWindow = calculateContractCapSpaceWindow(
    currentContracts,
    currentSeason,
    seasons ?? [],
  );
  const activeCurrentContractKeys = new Set(
    activeCurrentContracts.map(getContractUniqueKey),
  );
  const expiredRows = ownerContracts
    .filter((contract) => {
      const key = getContractUniqueKey(contract);
      return !activeCurrentContractKeys.has(key);
    })
    .sort((a, b) => {
      const signingDateDelta =
        new Date(b.signingDate).getTime() - new Date(a.signingDate).getTime();
      if (!Number.isNaN(signingDateDelta) && signingDateDelta !== 0) {
        return signingDateDelta;
      }
      return toNumber(b.contractSalary, 0) - toNumber(a.contractSalary, 0);
    })
    .map((contract) =>
      createHistoryRow(
        contract,
        playerById,
        seasonById,
        nhlSalaryByPlayerSeasonEndYear,
      ),
    );
  const seasonWindow =
    currentFranchiseId && currentSeason
      ? getDraftSeasonWindow(seasons, currentSeason)
      : [];
  const draftPickGroups = seasonWindow.map((season) => {
    const seasonTeam = teamPool.find(
      (team) =>
        String(team.franchiseId) === currentFranchiseId &&
        String(team.seasonId) === String(season.id),
    );
    const teamIdentifiers = new Set(
      [seasonTeam?.id, seasonTeam?.franchiseId]
        .filter(Boolean)
        .map((value) => String(value)),
    );
    const picks = (draftPicks ?? [])
      .filter(
        (draftPick) =>
          String(draftPick.seasonId) === String(season.id) &&
          teamIdentifiers.has(String(draftPick.gshlTeamId)),
      )
      .sort((a, b) => {
        if (toNumber(a.round, 0) !== toNumber(b.round, 0)) {
          return toNumber(a.round, 0) - toNumber(b.round, 0);
        }
        return toNumber(a.pick, 0) - toNumber(b.pick, 0);
      })
      .map((draftPick) => ({
        draftPick,
        selectedPlayer: draftPick.playerId
          ? playerById.get(String(draftPick.playerId))
          : undefined,
        originalTeam: resolveTeamReference(
          draftPick.originalTeamId,
          teamById,
          franchiseById,
        ),
        seasonTeam,
      }));

    return {
      seasonId: String(season.id),
      seasonName: season.name,
      picks,
    };
  });
  return {
    table: { contractGroups, capSpaceWindow },
    history: { rows: expiredRows, hasData: expiredRows.length > 0 },
    draft: {
      groups: draftPickGroups,
      hasData: draftPickGroups.some((group) => group.picks.length > 0),
    },
    currentContracts,
    contractPlayers,
    buyoutContracts,
    expiredRows,
    draftPickGroups,
  };
}

/**
 * Returns a stable key for contract deduplication and lookup operations.
 */
function getContractUniqueKey(contract: Contract): string {
  return contract.id || getContractDedupeKey(contract);
}

/**
 * Removes duplicate contracts while preserving original order.
 */
function dedupeContracts(contracts: Contract[]): Contract[] {
  const seenKeys = new Set<string>();
  return contracts.filter((contract) => {
    const key = getContractUniqueKey(contract);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
}

/**
 * Determines whether a contract still affects the active or future cap window.
 */
function hasCurrentOrFutureCapImpact(
  contract: Contract,
  activeSeasonEndYear: number | null,
): boolean {
  if (activeSeasonEndYear === null) return true;
  const endYear = getDateYear(contract.capHitEndDate);
  if (endYear === null) return true;
  return endYear >= activeSeasonEndYear;
}

/**
 * Determines whether a contract belongs in the current-contracts table.
 */
function shouldDisplayInCurrentContracts(
  contract: Contract,
  currentSeason: Season | undefined,
  activeSeasonEndYear: number | null,
  seasons: Season[] | undefined,
  referenceDate: Date,
): boolean {
  if (hasCurrentOrFutureCapImpact(contract, activeSeasonEndYear)) {
    return true;
  }

  return shouldShowRecentExpiryStatus(
    contract,
    currentSeason,
    activeSeasonEndYear,
    seasons,
    referenceDate,
  );
}

/**
 * Keeps very recent free-agent expiries visible until their signing deadline.
 */
function shouldShowRecentExpiryStatus(
  contract: Contract,
  currentSeason: Season | undefined,
  activeSeasonEndYear: number | null,
  seasons: Season[] | undefined,
  referenceDate: Date,
): boolean {
  if (!currentSeason || activeSeasonEndYear === null) return false;

  const isFreeAgentExpiry =
    contract.expiryStatus === ContractStatus.RFA ||
    contract.expiryStatus === ContractStatus.UFA;
  if (isFreeAgentExpiry) {
    if (
      !shouldShowExpiredFreeAgentContract({
        contract,
        currentSeason,
        seasons,
        referenceDate,
      })
    ) {
      return false;
    }
  } else {
    if (contract.expiryStatus === ContractStatus.BUYOUT) return false;

    const signingDeadline = parseDateValue(currentSeason.signingEndDate);
    if (!signingDeadline || referenceDate > signingDeadline) return false;
  }

  const expiryYear =
    getDateYear(contract.expiryDate) ?? getDateYear(contract.capHitEndDate);
  if (expiryYear === null) return false;

  return expiryYear === activeSeasonEndYear - 1;
}

/**
 * Safely converts a date-like value into a valid Date instance.
 */
function parseDateValue(value: Date | string | null | undefined): Date | null {
  if (!value) return null;

  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

/**
 * Normalizes a contract into the row shape used by franchise history tables.
 */
function createHistoryRow(
  contract: Contract,
  playerById: Map<string, Player>,
  seasonById: Map<string, Season>,
  nhlSalaryByPlayerSeasonEndYear: Map<string, number>,
): FranchiseContractHistoryRowType {
  const player = playerById.get(String(contract.playerId));
  const season = seasonById.get(String(contract.seasonId));
  const ownerId = String(contract.ownerId ?? "");
  const contractValue = calculateContractValue(
    contract,
    seasonById,
    nhlSalaryByPlayerSeasonEndYear,
  );

  return {
    id: contract.id,
    ownerId,
    playerName: player?.fullName ?? "Unknown",
    season: season?.name ?? String(contract.seasonId),
    type: Array.isArray(contract.contractType)
      ? contract.contractType.join(", ")
      : contract.contractType
        ? String(contract.contractType)
        : "-",
    length: toNumber(contract.contractLength, 0),
    salary: toNumber(contract.contractSalary, 0),
    capHit: toNumber(contract.capHit, 0),
    start: formatDate(contract.startDate),
    end: formatDate(contract.expiryDate),
    signingStatus: String(contract.signingStatus ?? "-"),
    expiryStatus: String(contract.expiryStatus ?? "-"),
    buyoutEnd:
      contract.expiryStatus === ContractStatus.BUYOUT
        ? formatDate(contract.capHitEndDate)
        : undefined,
    contractValue,
  };
}

/**
 * Calculates surplus value by comparing contract salary to NHL salary by
 * season across the contract window.
 */
function calculateContractValue(
  contract: Contract,
  seasonById: Map<string, Season>,
  nhlSalaryByPlayerSeasonEndYear: Map<string, number>,
): number | null {
  const playerId = String(contract.playerId ?? "");
  if (!playerId) return null;

  const activeSeasonEndYears = getContractActiveSeasonEndYears(
    contract,
    seasonById,
  );
  if (!activeSeasonEndYears.length) return null;

  const contractSalary = toNumber(contract.contractSalary, 0);
  let total = 0;
  for (const seasonEndYear of activeSeasonEndYears) {
    const seasonSalary = nhlSalaryByPlayerSeasonEndYear.get(
      getPlayerSeasonValueKey(playerId, seasonEndYear),
    );
    if (seasonSalary === undefined) return null;
    total += seasonSalary - contractSalary;
  }
  return total;
}

/**
 * Expands a contract into the list of active season-ending years it spans.
 */
function getContractActiveSeasonEndYears(
  contract: Contract,
  seasonById: Map<string, Season>,
): number[] {
  const length = Math.max(0, toNumber(contract.contractLength, 0));
  if (length <= 0) return [];

  const firstSeasonEndYear = getSeasonEndYear(
    seasonById.get(String(contract.seasonId)),
  );
  if (firstSeasonEndYear !== null) {
    return Array.from({ length }, (_, index) => firstSeasonEndYear + index);
  }

  const expiryYear = getDateYear(contract.expiryDate);
  if (expiryYear !== null) {
    const startYear = expiryYear - length + 1;
    return Array.from({ length }, (_, index) => startYear + index);
  }

  return [];
}

/**
 * Builds a composite key for player salary lookup by season-ending year.
 */
function getPlayerSeasonValueKey(
  playerId: string,
  seasonEndYear: number,
): string {
  return `${playerId}:${seasonEndYear}`;
}

/**
 * Returns the current and next draft seasons for franchise pick summaries.
 */
function getDraftSeasonWindow(
  seasons: Season[] | undefined,
  currentSeason: Season,
): Season[] {
  const ordered = [...(seasons ?? [])].sort((a, b) => {
    const aYear = getSeasonEndYear(a) ?? 0;
    const bYear = getSeasonEndYear(b) ?? 0;
    if (aYear !== bYear) return aYear - bYear;
    return String(a.id).localeCompare(String(b.id));
  });
  const currentIndex = ordered.findIndex(
    (season) => String(season.id) === String(currentSeason.id),
  );
  const nextSeason = currentIndex >= 0 ? ordered[currentIndex + 1] : undefined;

  return [currentSeason, nextSeason].filter((season): season is Season =>
    Boolean(season),
  );
}

/**
 * Resolves a team reference that may point to either a team id or franchise id.
 */
function resolveTeamReference(
  referenceId: string | null | undefined,
  teamById: Map<string, GSHLTeam>,
  franchiseById: Map<string, GSHLTeam>,
): GSHLTeam | undefined {
  if (!referenceId) return undefined;
  const key = String(referenceId);
  return teamById.get(key) ?? franchiseById.get(key);
}
