import { lstat, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

/** Share API inputs across calculation steps, retaining them only when requested. */
export async function withNhlSourceCache<T>(
  retainedDirectory: string | undefined,
  calculate: (directory: string) => Promise<T>,
): Promise<T> {
  if (retainedDirectory !== undefined) {
    if (!retainedDirectory.trim()) throw new Error("Empty NHL cache directory");
    return calculate(resolve(retainedDirectory));
  }

  const parent = await realpath(tmpdir());
  const directory = await mkdtemp(join(parent, "gshl-nhl-inputs-"));
  try {
    return await calculate(directory);
  } finally {
    // Delete only this invocation's scratch directory, never a supplied cache.
    const current = await lstat(directory);
    if (
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      dirname(directory) !== parent ||
      !basename(directory).startsWith("gshl-nhl-inputs-") ||
      (await realpath(directory)) !== directory
    )
      throw new Error("NHL temporary cache path changed; cleanup refused");
    await rm(directory, { recursive: true, force: false });
  }
}
