import reference from "./gshl-performance-rating-reference.json";
import {
  gshlPerformanceRating,
  projectGshlPerformanceRating,
} from "./gshl-performance-rating";

/** A frozen historical scale: adding a new opponent/week/season never moves it. */
export function playerWeekPerformanceRating(row: {
  Rating?: string | number | null;
  ratingVersion?: string | null;
  GS?: string | number | null;
}): number | null {
  return gshlPerformanceRating(row, "playerWeekStatLines");
}

export const PLAYER_WEEK_RATING_DESCRIPTION =
  "Weekly rating / 100 compares the value of the combined starter stat line with a fixed historical player-week reference across teams and seasons. 50 is the historical middle; 90 is around the top 10%. Daily ratings are never added. Players with no counted appearance are unrated.";

export const PLAYER_WEEK_RATING_REFERENCE_SIZE =
  reference.periods.playerWeekStatLines.sampleSize;

/** Raw contribution remains available for auditing; it is never called a rating. */
export function projectPlayerWeekRating<
  T extends {
    Rating?: string | number | null;
    ratingVersion?: string | null;
    GS?: string | number | null;
  },
>(row: T) {
  return projectGshlPerformanceRating(row, "playerWeekStatLines");
}
