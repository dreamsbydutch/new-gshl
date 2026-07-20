export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 50;

export function normalizePageLimit(limit?: number) {
  if (!Number.isFinite(limit)) return DEFAULT_PAGE_LIMIT;
  return Math.min(
    Math.max(Math.trunc(limit ?? DEFAULT_PAGE_LIMIT), 1),
    MAX_PAGE_LIMIT,
  );
}

export function createOffsetPage<T>(
  rows: readonly T[],
  cursor?: string | null,
  requestedLimit?: number,
) {
  const parsedOffset = cursor ? Number.parseInt(cursor, 10) : 0;
  const offset =
    Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
  const limit = normalizePageLimit(requestedLimit);
  const items = rows.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  const hasMore = nextOffset < rows.length;
  return {
    items,
    nextCursor: hasMore ? String(nextOffset) : null,
    hasMore,
  };
}
