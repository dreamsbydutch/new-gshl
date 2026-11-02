import assert from "node:assert/strict";
import test from "node:test";
import type { SeasonAwardsProps } from "@gshl-types";
import { buildAwardRaces } from "./award-races";

void test("four finalists use ordered public stats and conceal rated award order and scores", () => {
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
      teamW: 6 - i,
      teamL: i,
      teamT: 0,
      overallRk: i + 1,
      conferenceRk: 6 - i,
      GMOYRk: i + 1,
      hartRk: i + 1,
      norrisRk: i + 1,
      vezinaRk: i + 1,
      calderRk: i + 1,
      jackAdamsRk: i + 1,
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
  for (const key of [
    "team-rocket",
    "player-ovechkin",
    "team-artRoss",
    "player-gretzky",
  ]) {
    const card = cards.find((c) => c.id === key)!;
    assert.deepEqual(
      card.contenders.map((c) => c.name),
      ["Zulu", "Echo", "Delta", "Charlie"],
    );
    assert.equal(card.contenders[0]!.logoUrl, "/0.png");
    assert.equal(card.ranked, true);
    assert.ok(card.imageUrl);
    assert.deepEqual(
      card.contenders.map((c) => c.stat),
      key.endsWith("rocket") || key.endsWith("ovechkin")
        ? ["10 G", "9 G", "8 G", "7 G"]
        : ["20 P", "19 P", "18 P", "17 P"],
    );
  }
  for (const key of [
    "hart",
    "norris",
    "vezina",
    "calder",
    "gmoy",
    "jackAdams",
    "selke",
    "ladyByng",
  ]) {
    const card = cards.find((c) => c.id === `team-${key}`)!;
    assert.equal(card.ranked, false);
    assert.ok(card.imageUrl);
    assert.equal(card.contenders.length, 4);
    assert.deepEqual(card.contenders.map((c) => c.id).sort(), [
      "t0",
      "t1",
      "t2",
      "t3",
    ]);
    assert.ok(card.contenders.every((c) => !("stat" in c)));
  }
  const mvp = cards.find((c) => c.id === "player-crosby")!;
  assert.equal(mvp.ranked, false);
  assert.deepEqual(mvp.contenders.map((c) => c.id).sort(), [
    "p0",
    "p1",
    "p2",
    "p3",
  ]);
  assert.ok(mvp.contenders.every((c) => !("stat" in c)));
  assert.ok(
    !cards.some(
      (c) => c.id === "player-brodeur" || c.id === "player-connSmythe",
    ),
  );
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(
    cards.find((c) => c.id === "team-sunview")!.contenders.map((c) => c.name),
    ["Alpha", "Bravo", "Charlie", "Delta"],
  );
  for (const key of ["president", "sunview", "brophy"]) {
    const card = cards.find((c) => c.id === `team-${key}`)!;
    assert.equal(card.ranked, true);
    assert.equal(card.contenders.length, 4);
    assert.deepEqual(
      card.contenders.map((c) => c.stat),
      key === "president"
        ? ["6-0", "5-1", "4-2", "3-3"]
        : ["1-5", "2-4", "3-3", "4-2"],
    );
  }
  assert.deepEqual(buildAwardRaces(input), cards);
  const reordered = structuredClone(input);
  for (const [index, row] of reordered.teamStats.slice(0, 4).entries()) {
    for (const field of [
      "hartRk",
      "norrisRk",
      "vezinaRk",
      "calderRk",
      "GMOYRk",
      "jackAdamsRk",
    ] as const)
      row[field] = 4 - index;
  }
  for (const [index, row] of reordered.playerTotals.slice(0, 4).entries())
    row.Rating = String(97 + index);
  const reranked = buildAwardRaces(reordered);
  for (const card of cards.filter((c) => !c.ranked))
    assert.deepEqual(
      reranked.find((c) => c.id === card.id),
      card,
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
