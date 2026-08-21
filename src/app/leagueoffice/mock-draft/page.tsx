import { LeagueOfficeMockDraft } from "@gshl-components/league-office/LeagueOfficeMockDraft";
import { requireActiveUser } from "@gshl-lib/auth/require-user";
import type { ProtectedRoutePageProps } from "@gshl-types";

export default async function LeagueOfficeMockDraftPage({
  searchParams,
}: ProtectedRoutePageProps) {
  await requireActiveUser("/leagueoffice/mock-draft", await searchParams);
  return (
    <div className="container mx-auto px-4 py-8">
      <LeagueOfficeMockDraft />
    </div>
  );
}
