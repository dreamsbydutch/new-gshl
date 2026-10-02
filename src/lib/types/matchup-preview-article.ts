export interface MatchupPreviewFact {
  id: string;
  text: string;
}

export interface MatchupPreviewEvidence {
  writer: string;
  teamName: string;
  opponentName: string;
  startsAt: number;
  facts: MatchupPreviewFact[];
}

export interface MatchupPreviewArticle {
  teamId: string;
  writer: string;
  headline: string;
  paragraphs: string[];
  publishedAt: number;
}
