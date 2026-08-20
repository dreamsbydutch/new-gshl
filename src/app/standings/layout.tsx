import { Suspense } from "react";
import { StandingsLayout } from "@gshl-components/standings/StandingsLayout";
import { StandingsSkeleton } from "@gshl-skeletons";

export default function StandingsRouteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={<StandingsSkeleton />}>
      <StandingsLayout>{children}</StandingsLayout>
    </Suspense>
  );
}
