/** Live Convex reads throw to the existing error boundary; no refetch facade. */
export interface CollectionQueryResult<T> {
  data: T[];
  isLoading: boolean;
}

export interface ReadQueryResult<TData> {
  data: TData | undefined;
  isLoading: boolean;
}

export type QueryLike<TData> = {
  data: TData | undefined;
  isLoading?: boolean;
  isFetching?: boolean;
  error?: unknown;
};

export type QueryState = {
  isLoading: boolean;
};

export interface QueryAdapterOptions<TData, TMapped> {
  fallback: TMapped;
  map?: (data: TData | undefined) => TMapped;
}
