import assert from "node:assert/strict";
import { test } from "node:test";
import { loadNhlOrganizations } from "./nhl-organizations-data";
import { mergeNhlOrganizationSources } from "../lib/utils/features/nhl-organizations";

const source = (id: number) => ({
  forwards: [
    { id, firstName: { default: "Player" }, lastName: { default: String(id) } },
  ],
  defensemen: [],
  goalies: [],
});
const clubs = Array.from({ length: 32 }, (_, i) => ({
  seasonId: 20262027,
  teamAbbrev: {
    default: `A${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`,
  },
  teamName: { default: `Club ${i}` },
}));
const directory = clubs.map((c, i) => ({
  playerId: String(i * 10 + 2),
  name: `Depth ${i}`,
  positionCode: "C",
  teamAbbrev: c.teamAbbrev.default,
  active: true,
}));
const depth = (id: number) => [
  {
    nhlPlayerId: id,
    playerName: `Depth ${id}`,
    position: "F",
    membership: "organization",
  },
];
const read = async (path: string): Promise<unknown> => {
  if (path === "standings/now") return { standings: clubs };
  if (path === "directory") return directory;
  const index = clubs.findIndex(
    (c) => path.split("/")[1] === c.teamAbbrev.default,
  );
  return source(index * 10 + (path.startsWith("roster/") ? 1 : 2));
};
void test("official roster overrides overlapping directory entries and duplicate roles fail closed", () => {
  const merged = mergeNhlOrganizationSources(source(1), depth(1));
  assert.equal(merged.length, 1);
  assert.equal(merged[0]!.membership, "nhl-roster");
  const conflict = depth(1).map((p) => ({ ...p, position: "G" }));
  assert.throws(
    () => mergeNhlOrganizationSources(source(1), conflict),
    /position/,
  );
});
void test("organization loading requires all current clubs and unique identities", async () => {
  const all = await loadNhlOrganizations(20262027, read);
  assert.equal(all.teams.length, 32);
  assert.equal(all.teams.flatMap((t) => t.roster).length, 64);
  await assert.rejects(loadNhlOrganizations(20252026, read), /season/);
  await assert.rejects(
    loadNhlOrganizations(20262027, async (path) =>
      path === "standings/now" ? { standings: clubs.slice(0, 31) } : read(path),
    ),
  );
  await assert.rejects(
    loadNhlOrganizations(20262027, async (path) =>
      path.startsWith("roster/") ? source(1) : read(path),
    ),
    /identity/,
  );
});
void test("current NHL club wins over an old directory listing after a transfer", async () => {
  const d = await loadNhlOrganizations(20262027, async (path) =>
    path === "directory"
      ? directory.map((p, i) => (i === 1 ? { ...p, playerId: "1" } : p))
      : read(path),
  );
  assert.ok(d.teams[0]!.roster.some((p) => p.nhlPlayerId === 1));
  assert.ok(!d.teams[1]!.roster.some((p) => p.nhlPlayerId === 1));
});
