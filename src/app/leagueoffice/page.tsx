import { redirect } from "next/navigation";
import {
  buildAdminNavigationHref,
  buildLockerRoomNavigationHref,
  resolveLegacyLeagueOfficeAdminView,
} from "@gshl-utils";
import { LeagueOfficeContent } from "@gshl-components/league-office/LeagueOfficeContent";
import { requireActiveUser } from "@gshl-lib/auth/require-user";
import type { ProtectedRoutePageProps } from "@gshl-types";

export default async function LeagueOfficePage({
  searchParams,
}: ProtectedRoutePageProps) {
  const params = await searchParams;
  const user = await requireActiveUser("/leagueoffice", params);
  const requestedView =
    typeof params.view === "string" ? params.view : undefined;
  const adminView = resolveLegacyLeagueOfficeAdminView(requestedView);
  if (adminView && user.role === "commissioner") {
    redirect(buildAdminNavigationHref("", { view: adminView }));
  }
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
