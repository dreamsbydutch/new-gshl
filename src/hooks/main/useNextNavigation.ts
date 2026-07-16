"use client";

import { usePathname, useRouter } from "next/navigation";

/**
 * Returns the current Next.js pathname for app-router aware hooks/components.
 */
export function useAppPathname() {
  return usePathname();
}

/**
 * Returns the Next.js app router instance for imperative navigation.
 */
export function useAppRouter() {
  return useRouter();
}
