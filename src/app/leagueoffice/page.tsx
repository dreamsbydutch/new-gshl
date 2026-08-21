import { LeagueOfficeContent } from "@gshl-components/league-office/LeagueOfficeContent";
import { requireActiveUser } from "@gshl-lib/auth/require-user";
import type { ProtectedRoutePageProps } from "@gshl-types";

export default async function LeagueOfficePage({
  searchParams,
}: ProtectedRoutePageProps) {
  await requireActiveUser("/leagueoffice", await searchParams);
  return <LeagueOfficeContent />;
}
