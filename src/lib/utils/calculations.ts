// Calculation utility functions
import { SALARY_CAP } from "@gshl-types";

export function calculateCapSpace(
  contracts: Array<{ CapHit?: string | null }>,
): number {
  const totalCapHit = contracts.reduce((sum, contract) => {
    const capHit = parseFloat(contract.CapHit ?? "0");
    return sum + (Number.isNaN(capHit) ? 0 : capHit);
  }, 0);

  return SALARY_CAP - totalCapHit;
}

export function calculateCapPercentage(
  contracts: Array<{ CapHit?: string | null }>,
): number {
  const totalCapHit = contracts.reduce((sum, contract) => {
    const capHit = parseFloat(contract.CapHit ?? "0");
    return sum + (Number.isNaN(capHit) ? 0 : capHit);
  }, 0);

  return (totalCapHit / SALARY_CAP) * 100;
}

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

export function calculateFantasyPoints(stats: Record<string, number>): number {
  const scoring = {
    goals: 3,
    assists: 2,
    shots: 0.1,
    hits: 0.1,
    blocks: 0.2,
    wins: 3,
    saves: 0.1,
    shutouts: 2,
  } as const;

  return Object.entries(stats).reduce((total, [stat, value]) => {
    const weight = scoring[stat as keyof typeof scoring] ?? 0;
    return total + value * weight;
  }, 0);
}

export function calculateTeamRecord(
  matchups: Array<{
    homeTeamId: string;
    awayTeamId: string;
    homeWin?: boolean | null;
    awayWin?: boolean | null;
    tie?: boolean | null;
  }>,
  teamId: string,
): { wins: number; losses: number; ties: number } {
  return matchups.reduce(
    (record, matchup) => {
      if (matchup.homeTeamId === teamId) {
        if (matchup.homeWin) record.wins += 1;
        else if (matchup.awayWin) record.losses += 1;
        else if (matchup.tie) record.ties += 1;
      } else if (matchup.awayTeamId === teamId) {
        if (matchup.awayWin) record.wins += 1;
        else if (matchup.homeWin) record.losses += 1;
        else if (matchup.tie) record.ties += 1;
      }
      return record;
    },
    { wins: 0, losses: 0, ties: 0 },
  );
}

export function calculateSavePercentage(saves: number, shots: number): number {
  if (shots === 0) return 0;
  return (saves / shots) * 100;
}

export function calculateGoalsAgainstAverage(
  goalsAgainst: number,
  gamesPlayed: number,
): number {
  if (gamesPlayed === 0) return 0;
  return goalsAgainst / gamesPlayed;
}

export function calculatePointsPercentage(
  points: number,
  possiblePoints: number,
): number {
  if (possiblePoints === 0) return 0;
  return (points / possiblePoints) * 100;
}
