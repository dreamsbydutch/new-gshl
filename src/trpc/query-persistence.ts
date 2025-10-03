import {
  defaultShouldDehydrateQuery,
  type QueryClient,
} from "@tanstack/react-query";
import {
  persistQueryClient,
  type PersistedClient,
  type Persister,
} from "@tanstack/query-persist-client-core";
import SuperJSON from "superjson";
import { CACHE_DURATIONS, CACHE_VERSION } from "@gshl-cache";

const STORAGE_KEY = `gshl-query-cache::${CACHE_VERSION}`;
const PERSIST_MAX_AGE = CACHE_DURATIONS.DYNAMIC;

function createLocalStoragePersister(): Persister | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const storage = window.localStorage;

  return {
    persistClient: async (persistedClient) => {
      try {
        const serialized = SuperJSON.stringify(persistedClient);
        storage.setItem(STORAGE_KEY, serialized);
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error("Failed to persist query cache", error);
        }
      }
    },
    restoreClient: async () => {
      try {
        const serialized = storage.getItem(STORAGE_KEY);
        if (!serialized) {
          return undefined;
        }

        return SuperJSON.parse<PersistedClient>(serialized);
      } catch (error) {
        storage.removeItem(STORAGE_KEY);
        if (process.env.NODE_ENV !== "production") {
          console.warn("Discarding corrupted query cache", error);
        }
        return undefined;
      }
    },
    removeClient: async () => {
      storage.removeItem(STORAGE_KEY);
    },
  };
}

export interface QueryPersistenceHandle {
  unsubscribe: () => void;
  restorePromise: Promise<void>;
}

export function initQueryClientPersistence(
  queryClient: QueryClient,
): QueryPersistenceHandle {
  const persister = createLocalStoragePersister();

  if (!persister) {
    return {
      unsubscribe: () => {
        // no-op on server
      },
      restorePromise: Promise.resolve(),
    };
  }

  const [unsubscribe, restorePromise] = persistQueryClient({
    queryClient,
    persister,
    maxAge: PERSIST_MAX_AGE,
    buster: CACHE_VERSION,
    dehydrateOptions: {
      serializeData: SuperJSON.serialize,
      shouldDehydrateQuery: (query) => {
        const meta = query.meta as { persist?: boolean } | undefined;
        if (meta?.persist === false) {
          return false;
        }

        return defaultShouldDehydrateQuery(query);
      },
    },
    hydrateOptions: {
      defaultOptions: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });

  void restorePromise.catch((error) => {
    if (process.env.NODE_ENV !== "production") {
      console.error("Failed to restore persisted query cache", error);
    }
  });

  return {
    unsubscribe,
    restorePromise,
  };
}
