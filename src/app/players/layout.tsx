import { Suspense } from "react";
import { SectionNavigation } from "@gshl-components/nav/SectionNavigation";

export default function PlayersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Suspense fallback={null}>
        <SectionNavigation section="players" />
      </Suspense>
      {children}
    </>
  );
}
