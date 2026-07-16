import type { QueryState } from "@gshl-types";

type QueryStatusLike = {
  error?: QueryState["error"];
  isFetching?: boolean;
  isLoading?: boolean;
};

/**
 * Combines query states.
 *
 * @param queries - The queries to use.
 * @returns The combined query states.
 */
export function combineQueryStates(
  ...queries: QueryStatusLike[]
): QueryState {
  return {
    isLoading: queries.some((query) => Boolean(query?.isLoading)),
    isFetching: queries.some((query) => Boolean(query?.isFetching)),
    error: queries.map((query) => query?.error).find(Boolean) ?? null,
  };
}
