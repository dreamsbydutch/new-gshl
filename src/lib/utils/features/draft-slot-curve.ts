import calibration from "./draft-slot-calibration.json";

/** Historical RS rating expectation; calibration is generated from RankingEngine/config.js. */
export function expectedDraftRating(
  pick: number,
  maxPick: number,
): number | null {
  if (
    !Number.isInteger(pick) ||
    !Number.isInteger(maxPick) ||
    pick < 1 ||
    maxPick < pick
  )
    return null;
  return (
    calibration.floor + calibration.span * ((maxPick - pick + 1) / maxPick)
  );
}
