export const TRADE_BLOCK_NOTE_LIMIT = 180;

/** Normalizes an owner-facing trade note before it crosses the data boundary. */
export function normalizeTradeBlockNote(value: string | null | undefined) {
  const note = value?.replace(/\s+/g, " ").trim() ?? "";
  if (note.length > TRADE_BLOCK_NOTE_LIMIT) {
    throw new Error(
      `Trade block notes must be ${TRADE_BLOCK_NOTE_LIMIT} characters or fewer.`,
    );
  }
  return note || undefined;
}

/** Separates the selected owner's listings from the league without granting edit access. */
export function getTradeBlockPerspective<T extends { ownerId: string }>(
  listings: readonly T[],
  selectedOwnerId: string,
  viewerOwnerId: string | null | undefined,
  canManage: boolean,
) {
  return {
    teamListings: listings.filter(
      (listing) => listing.ownerId === selectedOwnerId,
    ),
    leagueListings: listings.filter(
      (listing) => listing.ownerId !== selectedOwnerId,
    ),
    canManageTeam:
      canManage &&
      Boolean(selectedOwnerId) &&
      selectedOwnerId === viewerOwnerId,
  };
}
