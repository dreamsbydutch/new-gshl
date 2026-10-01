import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareValueSeason,
  rankValueSeason,
  calibrateValueShrinkage,
  type PreparedValueSeason,
} from "../../runtime/nhl-season-value-v2";
import type {
  ExpectedGoalInput,
  ExpectedGoalPlayer,
  ChanceLine,
} from "../nhl/expected-goal-input";

function line(minutes: number, rate: number): ChanceLine {
  return {
    minutes,
    benchMinutes: 2000,
    xFor: minutes * rate,
    xAgainst: minutes * rate,
    rawXFor: minutes * rate,
    rawXAgainst: minutes * rate,
    offXFor: 2000 * rate,
    offXAgainst: 2000 * rate,
    goals: minutes * 0.01,
    individualXGoals: minutes * 0.01,
  };
}
function fixture(): ExpectedGoalInput {
  const players: ExpectedGoalPlayer[] = Array.from({ length: 8 }, (_, i) => ({
    player: {
      playerId: i + 1,
      name: `Skater ${i}`,
      position: "F",
      team: "ABC",
      games: 70,
      minutes: 1300,
      netMinorPenaltiesPer60: 0,
    },
    missing: [],
    warnings: [],
    sourceMinutes: 1300,
    sourceGames: 70,
    modeledMinutes: 1300,
    netPenalties: 0,
    situations: {
      "5on5": line(1000, 0.05),
      "5on4": line(200, 0.1),
      "4on5": line(100, 0.1),
    },
  }));
  for (let i = 0; i < 6; i++)
    players.push({
      player: {
        playerId: 100 + i,
        name: `Goalie ${i}`,
        position: "G",
        team: "ABC",
        games: 40,
        minutes: 2000,
      },
      missing: [],
      warnings: [],
      sourceMinutes: 2000,
      sourceGames: 40,
      modeledMinutes: 2000,
      situations: {},
      goalie: { expected: 100, goals: 100, shots: 1000 },
    });
  return { season: 20242025, gameType: 2, players, unmatchedProviderIds: [] };
}
const find = (rows: ReturnType<typeof rankValueSeason>, id = 1) =>
  rows.find((p) => p.playerId === id)!;

test("average play has zero value and added average minutes earn no bonus; inputs stay immutable", () => {
  const input = fixture();
  const p = input.players[0]!;
  p.player.minutes *= 2;
  p.modeledMinutes *= 2;
  for (const l of Object.values(p.situations)) {
    l.minutes *= 2;
    l.xFor *= 2;
    l.xAgainst *= 2;
    l.rawXFor *= 2;
    l.rawXAgainst *= 2;
    l.goals *= 2;
    l.individualXGoals *= 2;
  }
  const before = structuredClone(input);
  const rated = rankValueSeason(prepareValueSeason(input));
  assert.ok(rated.every((p) => p.seasonValue === 0));
  assert.equal(find(rated).seasonRating, 50);
  assert.deepEqual(input, before);
});

test("chance prevention and special teams respond without needing points or goalie saves", () => {
  const input = fixture();
  const p = input.players[0]!;
  p.situations["4on5"]!.xAgainst -= 6;
  p.situations["5on4"]!.xFor += 8;
  const rated = find(rankValueSeason(prepareValueSeason(input)));
  assert.ok(
    rated.components.find((c) => c.name === "4on5:defense")!.value > 0.3,
  );
  assert.ok(
    rated.components.find((c) => c.name === "5on4:offense")!.value > 0.4,
  );
  const before = rated.seasonValue;
  p.player.evGoalsAgainst = 500; // Boxscore goal outcomes cannot change skater defense.
  assert.equal(
    find(rankValueSeason(prepareValueSeason(input))).seasonValue,
    before,
  );
});

test("same save percentage rewards facing harder shots, using actual shot exposure", () => {
  const input = fixture();
  input.players.find((p) => p.player.playerId === 100)!.goalie!.expected = 120;
  const rated = rankValueSeason(prepareValueSeason(input));
  assert.ok(find(rated, 100).seasonValue! > find(rated, 101).seasonValue!);
  assert.equal(find(rated, 100).goalieGsax, 20);
  const expected = ((20 - 20 / 6) * 1000) / 1600;
  assert.ok(Math.abs(find(rated, 100).seasonValue! - expected) < 0.0001);
});

test("finishing is only goals above expected and penalties have the right sign", () => {
  const input = fixture();
  for (const p of input.players)
    if (p.situations["5on4"]) p.situations["5on4"]!.rawXAgainst = 2;
  input.players[0]!.situations["5on5"]!.goals += 10;
  input.players[0]!.netPenalties = 10;
  const rated = find(rankValueSeason(prepareValueSeason(input)));
  assert.ok(rated.components.find((c) => c.name === "finishing")!.value > 0);
  assert.ok(rated.components.find((c) => c.name === "penalties")!.value > 0);
  assert.equal(
    rated.components.find((c) => c.name === "5on5:offense")!.value,
    0,
  );
});

test("no special-team minutes is zero contribution; unknown data cannot yield a complete rank", () => {
  const input = fixture();
  input.players[0]!.situations["4on5"] = line(0, 0.1);
  input.players[1]!.missing.push("missing chance data");
  delete input.players[2]!.situations["5on5"];
  const rows = rankValueSeason(prepareValueSeason(input));
  assert.equal(
    find(rows).components.some((c) => c.name === "4on5:defense"),
    false,
  );
  assert.equal(find(rows).status, "rated");
  assert.equal(find(rows, 2).seasonValue, null);
  assert.equal(find(rows, 3).rank, null);
});

test("context adjustment is partial and shrinks short off-ice samples", () => {
  const input = fixture();
  input.players[0]!.situations["5on5"]!.offXFor *= 2;
  const raw = find(rankValueSeason(prepareValueSeason(input, 0))).seasonValue!;
  const partial = find(
    rankValueSeason(prepareValueSeason(input, 0.5)),
  ).seasonValue!;
  const full = find(rankValueSeason(prepareValueSeason(input, 1))).seasonValue!;
  assert.ok(full < partial && partial < raw);
});

test("chronological calibration excludes target/future seasons and does not bridge gaps", () => {
  const make = (season: number, sign: number): PreparedValueSeason => {
    const input = fixture();
    input.season = season;
    const prepared = prepareValueSeason(input);
    prepared.observations = Array.from({ length: 60 }, (_, i) => ({
      playerId: i,
      name: "finishing",
      position: "F",
      exposure: 1000,
      rate: sign * 0.01,
      observedValue: sign * 10,
    }));
    prepared.missing = {};
    return prepared;
  };
  const history = [make(20132014, 1), make(20142015, 1)];
  const result = calibrateValueShrinkage(history, 20152016, 2);
  assert.equal(result["F:finishing"]!.prior, 0);
  assert.deepEqual(
    calibrateValueShrinkage(
      [...history, make(20152016, -100), make(20162017, -100)],
      20152016,
      2,
    ),
    result,
  );
  assert.deepEqual(
    calibrateValueShrinkage([history[0]!, make(20152016, 1)], 20162017, 2),
    {},
  );
});
