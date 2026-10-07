import type { OwnerRankingMatchupComparison } from "../../types/owner-ranking-research";
import type { WeeklyEditionResearch } from "../../types/weekly-edition";

/** Optional career context, using the existing ladder rather than a new rating. */
export function buildOwnerRankingMatchupComparison({
  owners,
  homeTeamId,
  awayTeamId,
  asOf,
}: {
  owners: Pick<
    WeeklyEditionResearch["owners"][number],
    "ownerId" | "name" | "teamId" | "teamName" | "ranking"
  >[];
  homeTeamId: string;
  awayTeamId: string;
  asOf: string;
}): OwnerRankingMatchupComparison | undefined {
  const ranked = [
    ...new Map(
      owners
        .filter(
          (owner) =>
            owner.ranking &&
            Number.isFinite(owner.ranking.rating) &&
            Number.isInteger(owner.ranking.rank) &&
            owner.ranking.rank > 0,
        )
        .map((owner) => [owner.ownerId, owner]),
    ).values(),
  ];
  const home = owners.find((owner) => owner.teamId === homeTeamId);
  const away = owners.find((owner) => owner.teamId === awayTeamId);
  if (
    !home?.ranking ||
    !away?.ranking ||
    home.ownerId === away.ownerId ||
    ranked.length < 6
  )
    return undefined;
  if (
    ![home, away].every((owner) =>
      ranked.some((entry) => entry.ownerId === owner.ownerId),
    )
  )
    return undefined;
  // A new owner's base rating is not evidence of a weak career.
  if (
    [home, away].some((owner) => {
      const games =
        owner.ranking!.gamesPlayed ??
        owner.ranking!.overallWins + owner.ranking!.overallLosses;
      return !Number.isFinite(games) || games < 10;
    })
  )
    return undefined;
  const place = (owner: typeof home) =>
    1 +
    ranked.filter((other) => other.ranking!.rating > owner.ranking!.rating)
      .length;
  const homeRank = place(home);
  const awayRank = place(away);
  const band = Math.ceil(ranked.length / 4);
  const top = (owner: typeof home) =>
    ranked.filter((other) => other.ranking!.rating >= owner.ranking!.rating)
      .length <= band;
  const storyline =
    top(home) && top(away)
      ? "top_owners"
      : homeRank > ranked.length - band && awayRank > ranked.length - band
        ? "lower_ranked_owners"
        : Math.abs(homeRank - awayRank) >= Math.ceil(ranked.length / 2)
          ? "large_rank_gap"
          : undefined;
  if (!storyline) return undefined;
  const describe = (owner: typeof home) => ({
    ownerId: owner.ownerId,
    name: owner.name,
    teamName: owner.teamName,
    ladderRank: owner.ranking!.rank,
    seasonOwnerRank: place(owner),
    wins: owner.ranking!.overallWins,
    losses: owner.ranking!.overallLosses,
    cups: owner.ranking!.cups,
  });
  return {
    asOf,
    rankedOwnersInSeason: ranked.length,
    home: describe(home),
    away: describe(away),
    storyline,
    note: "Career Owner Ladder context from stored results through the dated cutoff. Ladder ranks include historical owners; season-owner ranks compare only owners with teams in this season, with equal ratings tied. Notability uses the top/bottom quarter or a gap of at least half the season-owner field, and at least ten recorded career matchups for both owners. Ownership uses stored franchise associations; undocumented transfers cannot be reconstructed. This is optional storyline context, not current team strength, a category advantage, a prediction or evidence of why a result happened. Do not infer improvement, pressure, poor management or an upset solely from owner rank.",
  };
}
