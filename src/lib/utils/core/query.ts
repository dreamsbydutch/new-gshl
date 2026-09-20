import type { QueryState } from "@gshl-types";

/** Compose initial loading state without inventing fetching or error support. */
export function combineQueryStates(
  ...queries: Array<{ isLoading?: boolean }>
): QueryState {
  return { isLoading: queries.some((query) => query.isLoading === true) };
}
