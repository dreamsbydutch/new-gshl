/**
 * Core Math Utilities
 * -------------------
 * Generic mathematical calculation functions that are not domain-specific.
 * These are pure functions for common calculations.
 */

/**
 * Calculates a player's age from their birth date.
 *
 * @param birthDate - The player's birth date (Date, string, or null)
 * @returns The player's age in years, or null if birth date is invalid
 */
export function calculatePlayerAge(
  birthDate: Date | string | null,
): number | null {
  if (!birthDate) return null;

  const parsedBirth =
    birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (Number.isNaN(parsedBirth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - parsedBirth.getFullYear();
  const monthDiff = today.getMonth() - parsedBirth.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < parsedBirth.getDate())
  ) {
    age -= 1;
  }

  return age;
}

/**
 * Calculates save percentage (saves / shots * 100).
 *
 * @param saves - Number of saves
 * @param shots - Number of shots against
 * @returns Save percentage as a number (0-100)
 */
export function calculateSavePercentage(saves: number, shots: number): number {
  if (shots === 0) return 0;
  return (saves / shots) * 100;
}

/**
 * Calculates goals against average (GAA).
 *
 * @param goalsAgainst - Number of goals allowed
 * @param gamesPlayed - Number of games played
 * @returns Goals against average
 */
export function calculateGoalsAgainstAverage(
  goalsAgainst: number,
  gamesPlayed: number,
): number {
  if (gamesPlayed === 0) return 0;
  return goalsAgainst / gamesPlayed;
}

/**
 * Calculates points percentage (points / possible points * 100).
 *
 * @param points - Points earned
 * @param possiblePoints - Total possible points
 * @returns Points percentage as a number (0-100)
 */
export function calculatePointsPercentage(
  points: number,
  possiblePoints: number,
): number {
  if (possiblePoints === 0) return 0;
  return (points / possiblePoints) * 100;
}

