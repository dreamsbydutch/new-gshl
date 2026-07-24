import type {
  Franchise,
  GSHLTeam,
  NHLTeam,
  TeamDayStatLine,
  TeamSeasonStatLine,
  TeamWeekStatLine,
} from "./database";

export type TeamResult =
  | GSHLTeam
  | NHLTeam
  | Franchise
  | TeamDayStatLine
  | TeamWeekStatLine
  | TeamSeasonStatLine;

export interface UseTeamsResult {
  data: TeamResult[];
  isLoading: boolean;
  error: Error | null;
}

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
