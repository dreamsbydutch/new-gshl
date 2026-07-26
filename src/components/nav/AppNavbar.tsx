"use client";

import { DraftHubNavbar } from "@gshl-components/draft/DraftHubNavbar";
import { useAppPathname } from "@gshl-hooks";
import { MainNavbar } from "./MainNavbar";

export function AppNavbar() {
  const { pathname } = useAppPathname();
  if (pathname === "/draft" || pathname.startsWith("/draft/")) {
    return <DraftHubNavbar />;
  }
  return <MainNavbar />;
}
