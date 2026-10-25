/** Keep diagnostics limited to code failures, without URLs containing query data. */
export function sanitizeNhlExplorerErrorText(value: string) {
  return value
    .replace(/https?:\/\/[^\s)]+/g, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
      } catch {
        return "[url]";
      }
    })
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(
      /\b(password|secret|token|cookie|authorization)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[redacted]",
    )
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, "[redacted]")
    .slice(0, 1500);
}

export function isNhlExplorerChunkError(error: Error) {
  return (
    error.name === "ChunkLoadError" ||
    /Loading (?:CSS )?chunk .*failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
      error.message,
    )
  );
}

/** A persistent guard is required: unavailable storage must never cause a reload loop. */
export function claimNhlExplorerChunkReload(
  storage: Pick<Storage, "getItem" | "setItem">,
  now: number,
) {
  const key = "gshl:nhl-chunk-reload";
  try {
    const previous = Number(storage.getItem(key));
    if (previous > 0 && now - previous < 300_000) return false;
    storage.setItem(key, String(now));
    return true;
  } catch {
    return false;
  }
}
