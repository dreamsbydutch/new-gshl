import { DraftHubTeamPage } from "@gshl-components/draft/DraftHubTeamPage";
import { requireActiveUser } from "@gshl-lib/auth/require-user";
import type { ProtectedRoutePageProps } from "@gshl-types";

export default async function DraftTeamsPage({
  searchParams,
}: ProtectedRoutePageProps) {
  await requireActiveUser("/draft/teams", await searchParams);
  return <DraftHubTeamPage mode="other-team" />;
}
