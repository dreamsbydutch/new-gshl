export interface MatchupPreviewFact {
  id: string;
  text: string;
}

export interface MatchupCategoryComparison {
  basis: "completed_week" | "preseason_projection";
  startDate: string;
  endDate: string;
  homeTeamName: string;
  awayTeamName: string;
  homeGoalieQualification?: number;
  awayGoalieQualification?: number;
  categories: {
    category: string;
    homeValue: number;
    awayValue: number;
    homeRank: number;
    awayRank: number;
    rankedTeams: number;
    lowerIsBetter: boolean;
  }[];
  note: string;
}

export interface MatchupPreviewEvidence {
  writer: string;
  teamName: string;
  opponentName: string;
  homeTeamName?: string;
  startsAt: number;
  facts: MatchupPreviewFact[];
  opposingArticle?: {
    writer: string;
    headline: string;
    paragraphs: string[];
  };
}

export interface MatchupPreviewArticle {
  teamId: string;
  writer: string;
  headline: string;
  paragraphs: string[];
  publishedAt: number;
}
