"use client";
import { useEffect } from "react";
import {
  claimNhlExplorerChunkReload,
  isNhlExplorerChunkError,
  sanitizeNhlExplorerErrorText,
} from "../../lib/utils/features/nhl-explorer-error";

const reported = new WeakSet<Error>();
export function useNhlExplorerRecovery(error: Error) {
  useEffect(() => {
    const chunk = isNhlExplorerChunkError(error);
    if (!reported.has(error)) {
      reported.add(error);
      const view = new URLSearchParams(window.location.search).get("view");
      void fetch("/api/nhl/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          name: sanitizeNhlExplorerErrorText(error.name),
          message: sanitizeNhlExplorerErrorText(error.message),
          stack: sanitizeNhlExplorerErrorText(error.stack ?? ""),
          view: view === "contracts" || view === "players" ? view : "teams",
          kind: chunk ? "chunk" : "render",
        }),
      }).catch(() => undefined);
    }
    if (chunk) {
      try {
        if (claimNhlExplorerChunkReload(window.sessionStorage, Date.now()))
          window.location.reload();
      } catch {
        /* The explicit reload button remains available. */
      }
    }
  }, [error]);
  return { reload: () => window.location.reload() };
}
