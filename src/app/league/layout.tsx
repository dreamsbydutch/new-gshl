import { Suspense } from "react";
import { SectionNavigation } from "@gshl-components/nav/SectionNavigation";

export default function LeagueLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Suspense fallback={null}>
        <SectionNavigation section="league" />
      </Suspense>
      {children}
    </>
  );
}
