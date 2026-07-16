/**
 * Calculates player age.
 *
 * @param birthDate - The birth date to use.
 * @returns The calculated player age.
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
 * Calculates save percentage.
 *
 * @param saves - The saves to use.
 * @param shots - The shots to use.
 * @returns The calculated save percentage.
 */
export function calculateSavePercentage(saves: number, shots: number): number {
  if (shots === 0) return 0;
  return (saves / shots) * 100;
}

/**
 * Calculates goals against average.
 *
 * @param goalsAgainst - The goals against to use.
 * @param gamesPlayed - The games played to use.
 * @returns The calculated goals against average.
 */
export function calculateGoalsAgainstAverage(
  goalsAgainst: number,
  gamesPlayed: number,
): number {
  if (gamesPlayed === 0) return 0;
  return goalsAgainst / gamesPlayed;
}

/**
 * Calculates points percentage.
 *
 * @param points - The points to use.
 * @param possiblePoints - The possible points to use.
 * @returns The calculated points percentage.
 */
export function calculatePointsPercentage(
  points: number,
  possiblePoints: number,
): number {
  if (possiblePoints === 0) return 0;
  return (points / possiblePoints) * 100;
}

