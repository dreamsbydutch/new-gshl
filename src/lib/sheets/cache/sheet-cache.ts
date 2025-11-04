import { getModelCacheTTL } from "../config/model-metadata";
import type { DatabaseRecord } from "../config/config";

export interface SheetRow<T extends DatabaseRecord> {
  rowIndex: number;
  model: T;
}

export interface SheetDataset<T extends DatabaseRecord> {
  rows: SheetRow<T>[];
  idToRowIndex: Map<string, number>;
}

function assertSheetDataset<T extends DatabaseRecord>(
  value: unknown,
): asserts value is SheetDataset<T> {
  if (!value) {
    throw new Error("Sheet dataset missing from cache entry");
  }
}

interface SheetCacheEntry {
  data?: unknown;
  promise?: Promise<unknown>;
  expiresAt: number;
  ttl: number;
}

interface SheetCacheStatsEntry {
  model: string;
  hasData: boolean;
  isRefreshing: boolean;
  expiresIn: number | null;
  ttl: number;
}

export class SheetCache {
  private readonly entries = new Map<string, SheetCacheEntry>();

  async getDataset<T extends DatabaseRecord>(
    modelName: string,
    loader: () => Promise<SheetDataset<T>>,
    ttlOverride?: number,
  ): Promise<SheetDataset<T>> {
    const entry = this.entries.get(modelName);
    const ttl = ttlOverride ?? entry?.ttl ?? getModelCacheTTL(modelName);
    const now = Date.now();

    if (entry?.data && now < entry.expiresAt) {
      assertSheetDataset<T>(entry.data);
      return Promise.resolve(entry.data);
    }

    if (entry) {
      if (!entry.promise) {
        entry.promise = this.createLoaderPromise(modelName, loader, ttl);
        entry.ttl = ttl;
        this.entries.set(modelName, entry);
      }

      if (entry.data) {
        assertSheetDataset<T>(entry.data);
        return Promise.resolve(entry.data);
      }

      return entry.promise as Promise<SheetDataset<T>>;
    }

    return this.createLoaderPromise(modelName, loader, ttl);
  }

  invalidate(modelName: string): void {
    this.entries.delete(modelName);
  }

  clear(): void {
    this.entries.clear();
  }

  getStats(): { totalEntries: number; entries: SheetCacheStatsEntry[] } {
    const now = Date.now();
    const entries: SheetCacheStatsEntry[] = Array.from(
      this.entries.entries(),
    ).map(([model, value]) => ({
      model,
      hasData: Boolean(value.data),
      isRefreshing: Boolean(value.promise),
      expiresIn: value.data ? value.expiresAt - now : null,
      ttl: value.ttl,
    }));

    return { totalEntries: entries.length, entries };
  }

  private createLoaderPromise<T extends DatabaseRecord>(
    modelName: string,
    loader: () => Promise<SheetDataset<T>>,
    ttl: number,
  ): Promise<SheetDataset<T>> {
    const guardedPromise = loader()
      .then((dataset) => {
        const entry: SheetCacheEntry = {
          data: dataset,
          ttl,
          expiresAt: Date.now() + ttl,
        };
        this.entries.set(modelName, entry);
        return dataset;
      })
      .catch((error) => {
        const current = this.entries.get(modelName);
        if (current && current.promise === guardedPromise) {
          this.entries.delete(modelName);
        }
        throw error;
      });

    const existing = this.entries.get(modelName);
    const nextEntry: SheetCacheEntry = existing ?? {
      ttl,
      expiresAt: Date.now() + ttl,
    };
    nextEntry.promise = guardedPromise;
    nextEntry.ttl = ttl;
    nextEntry.expiresAt = Date.now() + ttl;
    this.entries.set(modelName, nextEntry);

    return guardedPromise;
  }
}
