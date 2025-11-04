import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from "@tanstack/react-query";
import SuperJSON from "superjson";

const THIRTY_SECONDS_IN_MS = 1000 * 30;
const FIFTEEN_MINUTES_IN_MS = 1000 * 60 * 15;

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        // Using 30s as per architecture guidelines for initial stale window
        staleTime: THIRTY_SECONDS_IN_MS,
        // Add retry and refetch on window focus for better data consistency
        retry: 3,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        // Don't refetch on mount if data is fresh from server
        refetchOnMount: false,
        gcTime: FIFTEEN_MINUTES_IN_MS,
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });
