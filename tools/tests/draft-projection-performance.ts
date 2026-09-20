import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { buildMockDraftProjection } from "../../src/lib/utils/features/mock-draft";
import type {
  DraftBoardPlayer,
  DraftPick,
  GSHLTeam,
} from "../../src/lib/types";

// Synthetic full draft; no network requests or live draft writes.
const teams = Array.from({ length: 14 }, (_, i) => ({
  id: `team-${i}`,
  ownerId: `owner-${i}`,
})) as GSHLTeam[];
const players = Array.from({ length: 1000 }, (_, i) => {
  const position = ["C", "LW", "RW", "D", "G"][i % 5]!;
  return {
    id: `player-${i}`,
    fullName: `Player ${i}`,
    nhlPos: [position],
    posGroup: position === "G" ? "G" : position === "D" ? "D" : "F",
    overallRating: 100 - i / 20,
    overallRk: i + 1,
    yahooDraftRk: i + 1,
    dailyFaceoffRk: i + 1,
    nhlRk: i + 1,
  };
}) as DraftBoardPlayer[];
const picks: DraftPick[] = Array.from({ length: 210 }, (_, i) => ({
  id: `pick-${i}`,
  seasonId: "season",
  gshlTeamId: teams[i % 14]!.id,
  round: String(Math.floor(i / 14) + 1),
  pick: String(i + 1),
  isSigning: false,
  isTraded: false,
  createdAt: new Date(0),
  updatedAt: new Date(0),
}));
for (const take of [undefined, 6]) {
  const start = performance.now();
  const result = buildMockDraftProjection({
    teams,
    draftPlayers: players,
    rosterPlayers: [],
    seasonDraftPicks: picks,
    take,
  });
  const elapsed = performance.now() - start;
  console.log(
    JSON.stringify({ picks: result.length, elapsedMs: Math.round(elapsed) }),
  );
  assert.equal(result.length, take ?? 210);
}
