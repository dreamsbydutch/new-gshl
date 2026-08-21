import type { RouteSearchParams } from "@gshl-types";

const INTERNAL_CALLBACK_ORIGIN = "https://gshl.internal";

/**
 * Reconstructs a protected route's internal path from trusted route metadata
 * and App Router search parameters. Query names and values are encoded so they
 * cannot change the callback origin or pathname.
 */
export function buildInternalCallbackPath(
  pathname: string,
  searchParams: RouteSearchParams = {},
): string {
  if (
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    pathname.includes("\\")
  ) {
    return "/lockerroom";
  }

  try {
    const candidate = new URL(pathname, INTERNAL_CALLBACK_ORIGIN);
    if (
      candidate.origin !== INTERNAL_CALLBACK_ORIGIN ||
      candidate.search ||
      candidate.hash ||
      candidate.pathname !== pathname
    ) {
      return "/lockerroom";
    }
  } catch {
    return "/lockerroom";
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      query.append(key, value);
      continue;
    }
    if (value === undefined) continue;
    for (const item of value) query.append(key, item);
  }

  const serializedQuery = query.toString();
  return serializedQuery ? `${pathname}?${serializedQuery}` : pathname;
}

/**
 * Converts Auth.js's same-origin absolute callback URL to an internal path and
 * rejects every cross-origin or non-HTTP redirect target.
 */
export function resolveSafeCallbackPath(
  callbackUrl: string | null | undefined,
  requestOrigin: string | null | undefined,
  fallback = "/lockerroom",
): string {
  if (!callbackUrl) return fallback;
  if (!requestOrigin) return fallback;
  if (callbackUrl.includes("\\")) return fallback;

  try {
    const allowedOrigin = new URL(requestOrigin);
    const candidate = new URL(callbackUrl, allowedOrigin);
    if (
      (candidate.protocol !== "http:" && candidate.protocol !== "https:") ||
      candidate.origin !== allowedOrigin.origin
    ) {
      return fallback;
    }
    return `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    return fallback;
  }
}
