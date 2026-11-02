import assert from "node:assert/strict";
import test from "node:test";
import type { SeasonAwardsProps } from "@gshl-types";
import { buildAwardRaces } from "./award-races";

void test("races select five by merit, hide their order, and resolve team logos and owners", () => {
  const names = ["Zulu", "Echo", "Delta", "Charlie", "Bravo", "Alpha"];
  const input = {
    season: { id: "season" },
    playerAwards: [],
    teamAwards: [],
    teams: names.map((name, i) => ({
      id: `t${i}`,
      name,
      logoUrl: `/${i}.png`,
      ownerNickname: `Owner ${name}`,
      confName: "Sunview",
    })),
    teamStats: names.map((_, i) => ({
      seasonId: "season",
      seasonType: "RS",
      gshlTeamId: `t${i}`,
      G: 10 - i,
      P: 20 - i,
      HIT: 5,
      BLK: 5,
      playersUsed: 10,
      overallRk: i + 1,
      conferenceRk: 6 - i,
      GMOYRk: i + 1,
    })),
    players: names.map((fullName, i) => ({ id: `p${i}`, fullName })),
    playerTotals: names.map((_, i) => ({
      seasonId: "season",
      seasonType: "RS",
      playerId: `p${i}`,
      gshlTeamIds: [`t${i}`],
      GP: "1",
      Rating: String(100 - i),
      G: String(10 - i),
      P: String(20 - i),
      nhlPos: ["C"],
      posGroup: "F",
    })),
  } as unknown as SeasonAwardsProps;
  const before = JSON.stringify(input);
  const cards = buildAwardRaces(input);
  for (const key of ["team-rocket", "player-crosby"]) {
    const card = cards.find((c) => c.id === key)!;
    assert.deepEqual(
      card.contenders.map((c) => c.name),
      ["Bravo", "Charlie", "Delta", "Echo", "Zulu"],
    );
    assert.equal(card.contenders[4]!.logoUrl, "/0.png");
    assert.deepEqual(Object.keys(card.contenders[0]!).sort(), [
      "id",
      "logoUrl",
      "name",
    ]);
  }
  assert.equal(
    cards.find((c) => c.id === "team-gmoy")!.contenders[0]!.name,
    "Owner Bravo",
  );
  assert.ok(
    !cards.some(
      (c) => c.id === "player-brodeur" || c.id === "player-connSmythe",
    ),
  );
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(
    cards.find((c) => c.id === "team-sunview")!.contenders.map((c) => c.name),
    ["Alpha", "Bravo", "Charlie", "Delta", "Echo"],
  );
});

void test("races do not pad small eligible pools or include other seasons", () => {
  const input = {
    season: { id: "s" },
    teams: [],
    teamStats: [],
    players: [{ id: "p", fullName: "Player" }],
    playerTotals: [
      {
        seasonId: "s",
        seasonType: "RS",
        playerId: "p",
        GP: "1",
        Rating: "9",
        nhlPos: ["D"],
        posGroup: "D",
      },
      {
        seasonId: "other",
        seasonType: "RS",
        playerId: "p",
        GP: "1",
        Rating: "99",
      },
    ],
  } as unknown as SeasonAwardsProps;
  assert.equal(
    buildAwardRaces(input).find((c) => c.id === "player-lidstrom")!.contenders
      .length,
    1,
  );
});
