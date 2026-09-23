"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * Returns the current Next.js pathname for app-router aware hooks/components.
 */
export function useAppPathname() {
  return { pathname: usePathname() };
}

/**
 * Returns the Next.js app router instance for imperative navigation.
 */
export function useAppRouter() {
  const router = useRouter();
  // Next synchronizes native history updates with useSearchParams without a
  // route transition. Use this for query-only, in-page selections.
  const replaceInPlace = useCallback((href: string) => {
    window.history.replaceState(null, "", href);
  }, []);
  return { router, replaceInPlace };
}

/**
 * Returns a reactive, read-only query string through the hook integration
 * boundary. Callers use the serialized value in effect dependencies so URL
 * back/forward changes are observable without depending on object identity.
 */
export function useAppSearchParams() {
  const searchParams = useSearchParams();
  return { searchParams, search: searchParams.toString() };
}
