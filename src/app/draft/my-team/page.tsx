import { DraftHubTeamPage } from "@gshl-components/draft/DraftHubTeamPage";
import { requireActiveUser } from "@gshl-lib/auth/require-user";
import type { ProtectedRoutePageProps } from "@gshl-types";

export default async function MyDraftTeamPage({
  searchParams,
}: ProtectedRoutePageProps) {
  await requireActiveUser("/draft/my-team", await searchParams);
  return <DraftHubTeamPage mode="my-team" />;
}
