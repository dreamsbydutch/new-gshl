import type { Matchup } from "@gshl-types";
import { MatchupType } from "@gshl-types";

const PLAYOFF_MATCHUP_TYPES = new Set<MatchupType>([
  MatchupType.QUARTER_FINAL,
  MatchupType.SEMI_FINAL,
  MatchupType.FINAL,
]);

export function isPlayoffMatchupType(gameType: MatchupType): boolean {
  return PLAYOFF_MATCHUP_TYPES.has(gameType);
}

/**
 * Applies the playoff home-ice tiebreaker to a matchup result. Category scores
 * remain unchanged; only the recorded outcome is normalized.
 */
export function normalizePlayoffMatchupOutcome(matchup: Matchup): Matchup {
  if (!isPlayoffMatchupType(matchup.gameType)) return matchup;
  if (!matchup.isComplete && matchup.tie !== true) return matchup;

  const homeScore = Number(matchup.homeScore);
  const awayScore = Number(matchup.awayScore);
  const hasScores =
    matchup.homeScore != null &&
    matchup.awayScore != null &&
    Number.isFinite(homeScore) &&
    Number.isFinite(awayScore);

  if (hasScores) {
    return {
      ...matchup,
      homeWin: homeScore >= awayScore,
      awayWin: awayScore > homeScore,
      tie: false,
    };
  }

  if (matchup.tie === true) {
    return { ...matchup, homeWin: true, awayWin: false, tie: false };
  }

  return matchup;
}
