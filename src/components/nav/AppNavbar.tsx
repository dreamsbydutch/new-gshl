"use client";

import { useAppSearchParams } from "@gshl-hooks";
import { MainNavbar } from "./MainNavbar";

export function AppNavbar() {
  const { search } = useAppSearchParams();
  return <MainNavbar search={search} />;
}
