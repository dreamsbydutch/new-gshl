import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const inside = (parent: string, child: string) => {
  const rel = relative(parent, child);
  return (
    !rel || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  );
};

/** Recovery backup outside the workspace/OneDrive, verified before deletion. */
export async function backupSupersededYahooDays(input: {
  workspaceRoot: string;
  backupDirectory: string;
  scope: { target: string; leagueId: string; seasonId: string; date: string };
  rows: Array<Record<string, unknown> & { id: string }>;
  replacementRoster: unknown[];
}) {
  const root = await realpath(input.workspaceRoot);
  const requested = resolve(input.backupDirectory);
  if (inside(root, requested) || /onedrive/i.test(requested))
    throw new Error(
      "Recovery backup must be outside the workspace and OneDrive.",
    );
  await mkdir(requested, { recursive: true });
  const backup = await realpath(requested);
  if (inside(root, backup) || /onedrive/i.test(backup))
    throw new Error(
      "Recovery backup resolves inside the workspace or OneDrive.",
    );
  if (
    !input.rows.length ||
    new Set(input.rows.map((r) => r.id)).size !== input.rows.length
  )
    throw new Error("Recovery backup requires distinct superseded row IDs.");
  const text = JSON.stringify(
    {
      version: 1,
      reason: "Superseded by confirmed dated Yahoo league roster",
      capturedAt: new Date().toISOString(),
      ...input.scope,
      rows: input.rows,
      replacementRoster: input.replacementRoster,
    },
    null,
    2,
  );
  const sha256 = digest(text);
  const name = `${input.scope.date}-${randomUUID()}.json`;
  const path = resolve(backup, name);
  await writeFile(path, text, { flag: "wx" });
  if (digest(await readFile(path, "utf8")) !== sha256)
    throw new Error("Yahoo recovery backup failed read-back verification.");
  return { path, sha256, rows: input.rows.length };
}
