import { useMemo } from "react";

export type QueryLike<TData> = {
  data: TData | undefined;
  isLoading?: boolean;
  isFetching?: boolean;
  error?: unknown;
};

export type QueryState = {
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
};

export type QueryAdapterOptions<TData, TMapped> = {
  fallback: TMapped;
  map?: (data: TData | undefined) => TMapped;
};

/**
 * Normalises a query result by applying a mapper and fallback value.
 */
export function useQueryAdapter<
  TData,
  TMapped,
  TQuery extends QueryLike<TData> = QueryLike<TData>,
>(query: TQuery, options: QueryAdapterOptions<TData, TMapped>) {
  const { fallback, map } = options;

  const data = useMemo(() => {
    const next = map ? map(query.data) : (query.data as unknown as TMapped);
    return next ?? fallback;
  }, [query.data, fallback, map]);

  return {
    ...query,
    data,
  } as Omit<TQuery, "data"> & { data: TMapped };
}

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
