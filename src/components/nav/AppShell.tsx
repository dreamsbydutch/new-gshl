"use client";

import { useAppPathname } from "@gshl-hooks";
import { AppNavbar } from "./AppNavbar";
import { NavDefaults } from "./NavDefaults";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useAppPathname();
  const isStandaloneDraftRosterBoard = pathname === "/draft-roster-board";

  if (isStandaloneDraftRosterBoard) {
    return <>{children}</>;
  }

  return (
    <>
      <NavDefaults />
      <div className="pb-20 pt-5 lg:pb-8 lg:pt-16">{children}</div>
      <AppNavbar />
    </>
  );
}
