export interface OwnerRankingMatchupComparison {
  asOf: string;
  rankedOwnersInSeason: number;
  home: {
    ownerId: string;
    name: string;
    teamName: string;
    ladderRank: number;
    seasonOwnerRank: number;
    wins: number;
    losses: number;
    cups: number;
  };
  away: OwnerRankingMatchupComparison["home"];
  storyline: "top_owners" | "lower_ranked_owners" | "large_rank_gap";
  note: string;
}
