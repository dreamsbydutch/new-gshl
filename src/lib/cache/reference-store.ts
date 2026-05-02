import type { Franchise, GSHLTeam, Season, Week } from "@gshl-types";
import { CACHE_VERSION } from "./config";

const DATABASE_NAME = "gshl-reference-store";
const DATABASE_VERSION = 1;
const META_STORE = "meta";
const SEASONS_STORE = "seasons";
const WEEKS_STORE = "weeks";
const TEAMS_STORE = "teams";
const FRANCHISES_STORE = "franchises";
const LAST_UPDATED_KEY = "lastUpdated";
const CACHE_VERSION_KEY = "cacheVersion";

type ReferenceStoreName =
  | typeof SEASONS_STORE
  | typeof WEEKS_STORE
  | typeof TEAMS_STORE
  | typeof FRANCHISES_STORE;

type MetaRecord = {
  key: string;
  value: number | string;
};

export interface ReferenceSnapshot {
  seasons: Season[];
  weeks: Week[];
  teams: GSHLTeam[];
  franchises: Franchise[];
  updatedAt: number;
  cacheVersion: string;
}

function isBrowserWithIndexedDb() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function requestToPromise<T>(request: IDBRequest): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

class IndexedDbReferenceStore {
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  isSupported() {
    return isBrowserWithIndexedDb();
  }

  async getSnapshot(): Promise<ReferenceSnapshot | null> {
    const db = await this.getDb();
    if (!db) return null;

    const transaction = db.transaction(
      [META_STORE, SEASONS_STORE, WEEKS_STORE, TEAMS_STORE, FRANCHISES_STORE],
      "readonly",
    );

    const metaStore = transaction.objectStore(META_STORE);
    const lastUpdated = await requestToPromise<MetaRecord | undefined>(
      metaStore.get(LAST_UPDATED_KEY),
    );
    const cacheVersion = await requestToPromise<MetaRecord | undefined>(
      metaStore.get(CACHE_VERSION_KEY),
    );
    const seasons = await requestToPromise<Season[]>(
      transaction.objectStore(SEASONS_STORE).getAll(),
    );
    const weeks = await requestToPromise<Week[]>(
      transaction.objectStore(WEEKS_STORE).getAll(),
    );
    const teams = await requestToPromise<GSHLTeam[]>(
      transaction.objectStore(TEAMS_STORE).getAll(),
    );
    const franchises = await requestToPromise<Franchise[]>(
      transaction.objectStore(FRANCHISES_STORE).getAll(),
    );

    await transactionDone(transaction);

    if (!lastUpdated || !cacheVersion) {
      return null;
    }

    return {
      seasons,
      weeks,
      teams,
      franchises,
      updatedAt: Number(lastUpdated.value),
      cacheVersion: String(cacheVersion.value),
    };
  }

  async replaceSnapshot(
    snapshot: Omit<ReferenceSnapshot, "updatedAt" | "cacheVersion">,
  ): Promise<void> {
    const db = await this.getDb();
    if (!db) return;

    const transaction = db.transaction(
      [META_STORE, SEASONS_STORE, WEEKS_STORE, TEAMS_STORE, FRANCHISES_STORE],
      "readwrite",
    );

    this.replaceStoreContents(transaction.objectStore(SEASONS_STORE), snapshot.seasons);
    this.replaceStoreContents(transaction.objectStore(WEEKS_STORE), snapshot.weeks);
    this.replaceStoreContents(transaction.objectStore(TEAMS_STORE), snapshot.teams);
    this.replaceStoreContents(
      transaction.objectStore(FRANCHISES_STORE),
      snapshot.franchises,
    );

    const metaStore = transaction.objectStore(META_STORE);
    metaStore.put({ key: LAST_UPDATED_KEY, value: Date.now() } satisfies MetaRecord);
    metaStore.put({ key: CACHE_VERSION_KEY, value: CACHE_VERSION } satisfies MetaRecord);

    await transactionDone(transaction);
  }

  async putSeasons(seasons: Season[]): Promise<void> {
    await this.putRecords(SEASONS_STORE, seasons);
  }

  async putWeeks(weeks: Week[]): Promise<void> {
    await this.putRecords(WEEKS_STORE, weeks);
  }

  async putTeams(teams: GSHLTeam[]): Promise<void> {
    await this.putRecords(TEAMS_STORE, teams);
  }

  async putFranchises(franchises: Franchise[]): Promise<void> {
    await this.putRecords(FRANCHISES_STORE, franchises);
  }

  async clear(): Promise<void> {
    const db = await this.getDb();
    if (!db) return;

    const transaction = db.transaction(
      [META_STORE, SEASONS_STORE, WEEKS_STORE, TEAMS_STORE, FRANCHISES_STORE],
      "readwrite",
    );

    transaction.objectStore(META_STORE).clear();
    transaction.objectStore(SEASONS_STORE).clear();
    transaction.objectStore(WEEKS_STORE).clear();
    transaction.objectStore(TEAMS_STORE).clear();
    transaction.objectStore(FRANCHISES_STORE).clear();

    await transactionDone(transaction);
  }

  async getSeasons(): Promise<Season[]> {
    return this.getAllFromStore<Season>(SEASONS_STORE);
  }

  async getWeeks(): Promise<Week[]> {
    return this.getAllFromStore<Week>(WEEKS_STORE);
  }

  async getWeeksBySeason(seasonId: string): Promise<Week[]> {
    const weeks = await this.getWeeks();
    return weeks.filter((week) => String(week.seasonId) === String(seasonId));
  }

  async getTeams(): Promise<GSHLTeam[]> {
    return this.getAllFromStore<GSHLTeam>(TEAMS_STORE);
  }

  async getTeamsBySeason(seasonId: string): Promise<GSHLTeam[]> {
    const teams = await this.getTeams();
    return teams.filter((team) => String(team.seasonId) === String(seasonId));
  }

  async getFranchises(): Promise<Franchise[]> {
    return this.getAllFromStore<Franchise>(FRANCHISES_STORE);
  }

  private async getAllFromStore<T>(storeName: ReferenceStoreName): Promise<T[]> {
    const db = await this.getDb();
    if (!db) return [];

    const transaction = db.transaction(storeName, "readonly");
    const result = await requestToPromise<T[]>(
      transaction.objectStore(storeName).getAll(),
    );
    await transactionDone(transaction);
    return result;
  }

  private async putRecords<T extends { id: string }>(
    storeName: ReferenceStoreName,
    records: T[],
  ): Promise<void> {
    const db = await this.getDb();
    if (!db) return;

    const transaction = db.transaction([META_STORE, storeName], "readwrite");
    const store = transaction.objectStore(storeName);

    for (const record of records) {
      store.put(record);
    }

    const metaStore = transaction.objectStore(META_STORE);
    metaStore.put({ key: LAST_UPDATED_KEY, value: Date.now() } satisfies MetaRecord);
    metaStore.put({ key: CACHE_VERSION_KEY, value: CACHE_VERSION } satisfies MetaRecord);

    await transactionDone(transaction);
  }

  private replaceStoreContents(store: IDBObjectStore, records: Array<{ id: string }>) {
    store.clear();
    for (const record of records) {
      store.put(record);
    }
  }

  private async getDb(): Promise<IDBDatabase | null> {
    if (!isBrowserWithIndexedDb()) {
      return null;
    }

    this.dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;

          if (!db.objectStoreNames.contains(META_STORE)) {
            db.createObjectStore(META_STORE, { keyPath: "key" });
          }
          if (!db.objectStoreNames.contains(SEASONS_STORE)) {
            db.createObjectStore(SEASONS_STORE, { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains(WEEKS_STORE)) {
            db.createObjectStore(WEEKS_STORE, { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains(TEAMS_STORE)) {
            db.createObjectStore(TEAMS_STORE, { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains(FRANCHISES_STORE)) {
            db.createObjectStore(FRANCHISES_STORE, { keyPath: "id" });
          }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
      }).catch((error) => {
        if (process.env.NODE_ENV !== "production") {
          console.error("Failed to initialize reference store", error);
        }
        return null;
      });

    return this.dbPromise;
  }
}

export const referenceStore = new IndexedDbReferenceStore();