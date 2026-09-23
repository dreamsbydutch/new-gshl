import { LeagueOfficeContent } from "@gshl-components/league-office/LeagueOfficeContent";
import { requireActiveUser } from "@gshl-lib/auth/require-user";
import type { ProtectedRoutePageProps } from "@gshl-types";
import { redirect } from "next/navigation";

export default async function LeagueOfficePage({
  searchParams,
}: ProtectedRoutePageProps) {
  const params = await searchParams;
  if (params.view === "rules") redirect("/rulebook");
  await requireActiveUser("/leagueoffice", params);
  return <LeagueOfficeContent />;
}
