import {
  defaultShouldDehydrateQuery,
  hydrate,
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
const PERSIST_MAX_AGE = CACHE_DURATIONS.STATIC;

function getStorage(): Storage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.localStorage;
}

function readPersistedClient(storage: Storage): PersistedClient | undefined {
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
}

function isPersistedClientFresh(persistedClient: PersistedClient): boolean {
  if (persistedClient.buster !== CACHE_VERSION) {
    return false;
  }

  return Date.now() - persistedClient.timestamp <= PERSIST_MAX_AGE;
}

function createLocalStoragePersister(): Persister | undefined {
  const storage = getStorage();

  if (!storage) {
    return undefined;
  }

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
      const persistedClient = readPersistedClient(storage);
      if (!persistedClient) {
        return undefined;
      }

      if (!isPersistedClientFresh(persistedClient)) {
        storage.removeItem(STORAGE_KEY);
        return undefined;
      }

      return persistedClient;
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

export function restorePersistedQueryClientSync(
  queryClient: QueryClient,
): boolean {
  const storage = getStorage();

  if (!storage) {
    return false;
  }

  const persistedClient = readPersistedClient(storage);
  if (!persistedClient) {
    return false;
  }

  if (!isPersistedClientFresh(persistedClient)) {
    storage.removeItem(STORAGE_KEY);
    return false;
  }

  hydrate(queryClient, persistedClient.clientState, {
    defaultOptions: {
      deserializeData: SuperJSON.deserialize,
    },
  });

  return true;
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
