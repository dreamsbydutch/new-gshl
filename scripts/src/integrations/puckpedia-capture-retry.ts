/** Retry a complete read-only capture; callers publish only the final result. */
export async function withPuckPediaCaptureRecovery<T>(
  capture: () => Promise<T>,
  wait: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await capture();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const transient =
        /net::ERR_ABORTED\b/.test(message) ||
        /PuckPedia's own page loader failed for (skaters|goalies) page \d+\./.test(
          message,
        );
      if (!transient || attempt >= 2) throw error;
      // Start with a fresh page and discard all partial directories. The worker
      // continues heartbeating its lease; nothing is uploaded until capture ends.
      await wait(3000 * (attempt + 1));
    }
  }
}
