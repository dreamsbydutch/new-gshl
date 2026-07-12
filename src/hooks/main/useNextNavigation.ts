"use client";

import { usePathname, useRouter } from "next/navigation";

export function useAppPathname() {
  return usePathname();
}

export function useAppRouter() {
  return useRouter();
}
