import type {
  Contract,
  DraftClassCertainty,
  DraftClassPosition,
  DraftClassRow,
  DraftClassSummary,
  Player,
} from "@gshl-types";
import { safeParseSheetDate } from "../core";
import { ContractStatus } from "../domain/constants";
import { filterAvailableDraftPlayers } from "./draft-board-list";

/**
 * Returns draft class cutoff.
 *
 * @param draftYear - The draft year to use.
 * @param offset - The offset to use.
 * @returns The requested draft class cutoff.
 */
export function getDraftClassCutoff(draftYear: number, offset: number): Date {
  return new Date(draftYear + offset, 3, 19);
}

/**
 * Returns draft class offset.
 *
 * @param selectedType - The selected type to use.
 * @returns The requested draft class offset.
 */
export function getDraftClassOffset(selectedType: string): number {
  if (selectedType === "cyufa") return 0;
  if (selectedType === "nyufa") return 1;
  if (selectedType === "fyufa") return 2;
  return 3;
}

/**
 * Finds expiring draft class contract.
 *
 * @param activeContracts - The active contracts to use.
 * @param playerId - The player id to use.
 * @param previousCutoff - The previous cutoff to use.
 * @param cutoff - The cutoff to use.
 * @returns The matching expiring draft class contract, if one exists.
 */
export function findExpiringDraftClassContract(
  activeContracts: Contract[],
  playerId: string,
  previousCutoff: Date,
  cutoff: Date,
): Contract | undefined {
  return activeContracts
    .filter((contract) => String(contract.playerId) === playerId)
    .filter((contract) => {
      const expiryDate = safeParseSheetDate(contract.expiryDate);

      if (!expiryDate) {
        return false;
      }

      return (
        previousCutoff.getTime() <= expiryDate.getTime() &&
        expiryDate.getTime() < cutoff.getTime()
      );
    })
    .sort((left, right) => {
      const leftExpiry = safeParseSheetDate(left.expiryDate)?.getTime() ?? 0;
      const rightExpiry = safeParseSheetDate(right.expiryDate)?.getTime() ?? 0;
      return rightExpiry - leftExpiry;
    })[0];
}

/** Builds one projected draft class without mutating source player rows. */
export function buildDraftClassRows(options: {
  players: Player[];
  contracts: Contract[];
  draftYear: number;
  offset: number;
}): DraftClassRow[] {
  const previousCutoff = getDraftClassCutoff(
    options.draftYear,
    options.offset - 1,
  );
  const cutoff = getDraftClassCutoff(options.draftYear, options.offset);

  return filterAvailableDraftPlayers(options.players, options.contracts, cutoff)
    .map((player) => {
      const expiringContract = findExpiringDraftClassContract(
        options.contracts,
        String(player.id),
        previousCutoff,
        cutoff,
      );
      return {
        player,
        expiringContract,
        isGuaranteedUfa: expiringContract?.expiryStatus === ContractStatus.UFA,
      };
    })
    .sort(
      (left, right) =>
        Number(right.player.overallRating ?? -1) -
          Number(left.player.overallRating ?? -1) ||
        Number(left.player.overallRk ?? Number.MAX_SAFE_INTEGER) -
          Number(right.player.overallRk ?? Number.MAX_SAFE_INTEGER) ||
        left.player.fullName.localeCompare(right.player.fullName),
    );
}

/** Applies the visible draft-class controls to a precomputed projection. */
export function filterDraftClassRows(options: {
  rows: DraftClassRow[];
  search: string;
  position: DraftClassPosition;
  certainty: DraftClassCertainty;
}): DraftClassRow[] {
  const search = options.search.trim().toLocaleLowerCase();
  return options.rows.filter((row) => {
    if (
      options.position !== "all" &&
      row.player.posGroup !== options.position
    ) {
      return false;
    }
    if (options.certainty === "guaranteed" && !row.isGuaranteedUfa) {
      return false;
    }
    if (options.certainty === "projected" && row.isGuaranteedUfa) {
      return false;
    }
    if (!search) return true;
    return [
      row.player.fullName,
      row.player.nhlTeam,
      row.player.posGroup,
      ...(row.player.nhlPos ?? []),
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(search);
  });
}

export function summarizeDraftClass(rows: DraftClassRow[]): DraftClassSummary {
  const ratings = rows
    .map((row) => Number(row.player.overallRating))
    .filter(Number.isFinite);
  return {
    available: rows.length,
    guaranteedUfas: rows.filter((row) => row.isGuaranteedUfa).length,
    goalies: rows.filter((row) => row.player.posGroup === "G").length,
    averageRating: ratings.length
      ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length
      : null,
  };
}
