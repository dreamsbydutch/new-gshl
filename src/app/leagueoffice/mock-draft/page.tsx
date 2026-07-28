import { LeagueOfficeMockDraft } from "@gshl-components/league-office/LeagueOfficeMockDraft";
import { requireActiveUser } from "@gshl-lib/auth/require-user";

export default async function LeagueOfficeMockDraftPage() {
  await requireActiveUser("/leagueoffice/mock-draft");
  return (
    <div className="container mx-auto px-4 py-8">
      <LeagueOfficeMockDraft />
    </div>
  );
}
