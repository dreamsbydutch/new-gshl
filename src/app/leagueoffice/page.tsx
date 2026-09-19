import { redirect } from "next/navigation";
import { buildLockerRoomNavigationHref } from "@gshl-utils";
import { LeagueOfficeContent } from "@gshl-components/league-office/LeagueOfficeContent";
import { requireActiveUser } from "@gshl-lib/auth/require-user";
import type { ProtectedRoutePageProps } from "@gshl-types";

export default async function LeagueOfficePage({
  searchParams,
}: ProtectedRoutePageProps) {
  const params = await searchParams;
  await requireActiveUser("/leagueoffice", params);
  if (params.view === "tradeBlock") {
    redirect(
      buildLockerRoomNavigationHref("", {
        view: "tradeBlock",
        owner: typeof params.owner === "string" ? params.owner : undefined,
      }),
    );
  }
  return <LeagueOfficeContent />;
}
