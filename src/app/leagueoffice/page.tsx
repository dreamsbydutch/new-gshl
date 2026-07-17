import { LeagueOfficeContent } from "@gshl-components/league-office/LeagueOfficeContent";
import { requireActiveUser } from "@gshl-lib/auth/require-user";

export default async function LeagueOfficePage() {
  await requireActiveUser("/leagueoffice");
  return <LeagueOfficeContent />;
}
