"use client";

import { Suspense } from "react";
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
      <a
        href="#app-content"
        className="sr-only fixed left-[max(0.75rem,env(safe-area-inset-left))] top-[calc(0.75rem+env(safe-area-inset-top))] z-[110] rounded-md bg-white px-4 py-3 font-semibold text-slate-950 shadow-lg focus:not-sr-only"
      >
        Skip to content
      </a>
      <Suspense fallback={null}>
        <AppNavbar />
      </Suspense>
      <div
        id="app-content"
        tabIndex={-1}
        className="min-h-dvh pb-[calc(var(--app-primary-nav-height)+env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[calc(var(--app-mobile-header-height)+env(safe-area-inset-top))] outline-none has-[[data-page-context-double]]:pb-[calc(var(--app-primary-nav-height)+var(--app-page-context-row-height)+var(--app-page-context-row-height)+env(safe-area-inset-bottom))] has-[[data-page-context-single]]:pb-[calc(var(--app-primary-nav-height)+var(--app-page-context-row-height)+env(safe-area-inset-bottom))] lg:pb-0 lg:pt-[calc(var(--app-primary-nav-height)+env(safe-area-inset-top))] lg:has-[[data-page-context-double]]:pb-0 lg:has-[[data-page-context-single]]:pb-0 print:min-h-0 print:p-0"
      >
        {children}
      </div>
    </>
  );
}
