// Calculation utility functions
import { SALARY_CAP } from "@gshl-types";

export function calculateCapSpace(
  contracts: Array<{ CapHit?: string | null }>,
): number {
  const totalCapHit = contracts.reduce((sum, contract) => {
    const capHit = parseFloat(contract.CapHit ?? "0");
    return sum + (isNaN(capHit) ? 0 : capHit);
  }, 0);

  return SALARY_CAP - totalCapHit;
}

export function calculateCapPercentage(
  contracts: Array<{ CapHit?: string | null }>,
): number {
  const totalCapHit = contracts.reduce((sum, contract) => {
    const capHit = parseFloat(contract.CapHit ?? "0");
    return sum + (isNaN(capHit) ? 0 : capHit);
  }, 0);

  return (totalCapHit / SALARY_CAP) * 100;
}

export function calculatePlayerAge(birthDate: Date | null): number | null {
  if (!birthDate) return null;

  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}

export function calculateFantasyPoints(stats: Record<string, number>): number {
  // Example fantasy scoring system
  const scoring = {
    goals: 3, // Goals
    assists: 2, // Assists
    shots: 0.1, // Shots on Goal
    hits: 0.1, // Hits
    blocks: 0.2, // Blocks
    wins: 3, // Wins (Goalie)
    saves: 0.1, // Saves
    shutouts: 2, // Shutouts
  };

  return Object.entries(stats).reduce((total, [stat, value]) => {
    const points = scoring[stat as keyof typeof scoring] || 0;
    return total + value * points;
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
        if (matchup.homeWin) record.wins++;
        else if (matchup.awayWin) record.losses++;
        else if (matchup.tie) record.ties++;
      } else if (matchup.awayTeamId === teamId) {
        if (matchup.awayWin) record.wins++;
        else if (matchup.homeWin) record.losses++;
        else if (matchup.tie) record.ties++;
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
