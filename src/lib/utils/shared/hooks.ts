import type { QueryLike, QueryState } from "@gshl-types";

/**
 * Collapses multiple query states into a single status descriptor.
 */
export function combineQueryStates(
  ...queries: QueryLike<unknown>[]
): QueryState {
  return {
    isLoading: queries.some((query) => Boolean(query?.isLoading)),
    isFetching: queries.some((query) => Boolean(query?.isFetching)),
    error: queries.map((query) => query?.error).find(Boolean) ?? null,
  };
}
