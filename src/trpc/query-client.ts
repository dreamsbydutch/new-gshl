import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from "@tanstack/react-query";
import SuperJSON from "superjson";

const DEFAULT_QUERY_GC_TIME = 1000 * 60 * 15;

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 30 * 1000,
        // Add retry and refetch on window focus for better data consistency
        retry: 3,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        // Ensure fresh data when component mounts
        refetchOnMount: true,
        gcTime: DEFAULT_QUERY_GC_TIME,
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
