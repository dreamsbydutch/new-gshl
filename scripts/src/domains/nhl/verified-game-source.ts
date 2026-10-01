import {
  HockeyDataCache,
  fetchGameSources,
} from "../../integrations/nhl/game-value-source";
import { buildGameValueData, type Shot } from "./game-value-input";

/** Source selection uses reconciliation only, never a player's resulting rating. */
export async function loadVerifiedGame(
  cache: HockeyDataCache,
  gameId: number,
  shots: Shot[],
  probabilities?: Map<number, number>,
  penaltyShotProbability?: number,
) {
  let sources = await fetchGameSources(cache, gameId);
  let game = buildGameValueData(
    sources,
    shots,
    probabilities,
    penaltyShotProbability,
  );
  const review = {
    gameId,
    attempted: false,
    accepted: false,
    originalIssues: [...game.issues],
    alternateIssues: [] as string[],
  };
  if (!game.eligible && sources.shiftSource === "nhl-api") {
    review.attempted = true;
    try {
      const alternate = await fetchGameSources(cache, gameId, "nhl-toi-report");
      const candidate = buildGameValueData(
        alternate,
        shots,
        probabilities,
        penaltyShotProbability,
      );
      review.alternateIssues = candidate.issues;
      if (
        candidate.eligible ||
        (candidate.usableProcessSeconds > game.usableProcessSeconds &&
          candidate.shots.length >= game.shots.length)
      ) {
        sources = alternate;
        game = candidate;
        review.accepted = true;
      }
    } catch (error) {
      review.alternateIssues = [
        error instanceof Error ? error.message : String(error),
      ];
    }
  }
  return { sources, game, review };
}
