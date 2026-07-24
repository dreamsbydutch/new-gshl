import { MatchupPageContent } from "@gshl-components/matchup/MatchupPageContent";
import type { MatchupPageProps } from "@gshl-types";

export default async function MatchupPage({ params }: MatchupPageProps) {
  const { matchupId } = await params;
  return <MatchupPageContent matchupId={matchupId} />;
}
