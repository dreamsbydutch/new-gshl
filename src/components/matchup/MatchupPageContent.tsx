import { MatchupDetailsContent } from "./MatchupDetailsContent";

export function MatchupPageContent({ matchupId }: { matchupId: string }) {
  return <MatchupDetailsContent matchupId={matchupId} />;
}
