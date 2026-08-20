import { Suspense } from "react";
import { LeagueOfficeLayout } from "@gshl-components/league-office/LeagueOfficeLayout";
import { LeagueOfficeRouteSkeleton } from "@gshl-skeletons";

export default function LeagueOfficeRouteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={<LeagueOfficeRouteSkeleton />}>
      <LeagueOfficeLayout>{children}</LeagueOfficeLayout>
    </Suspense>
  );
}
