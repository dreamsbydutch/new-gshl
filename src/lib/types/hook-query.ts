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

export interface QueryAdapterOptions<TData, TMapped> {
  fallback: TMapped;
  map?: (data: TData | undefined) => TMapped;
}
