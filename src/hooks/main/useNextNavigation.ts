"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
  return { router: useRouter() };
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
