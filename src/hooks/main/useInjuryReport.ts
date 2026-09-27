"use client";

import { useSyncExternalStore } from "react";
import type { InjuryFeedState, InjuryReport } from "@gshl-lib/types/injuries";
import { INJURY_REFRESH_MS } from "@gshl-utils/features/injuries";

const initial: InjuryFeedState = { data: null, error: null, loading: true };
let state = initial;
let pending: Promise<void> | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let lastAttempt = 0;
const listeners = new Set<() => void>();

function publish(next: InjuryFeedState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function refresh() {
  if (pending) return pending;
  lastAttempt = Date.now();
  pending = (async () => {
    try {
      const response = await fetch("/api/nhl/injuries", {
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error("Injury feed unavailable");
      const data = (await response.json()) as InjuryReport;
      publish({ data, error: null, loading: false });
    } catch {
      publish({
        ...state,
        loading: false,
        error: "Unable to refresh ESPN injury updates.",
      });
    } finally {
      pending = null;
    }
  })();
  return pending;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    if (Date.now() - lastAttempt > 60000) void refresh();
    timer = setInterval(() => {
      void refresh();
    }, INJURY_REFRESH_MS);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) clearInterval(timer);
  };
}

export function useInjuryReport() {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => initial,
  );
  return { ...snapshot, refresh };
}
