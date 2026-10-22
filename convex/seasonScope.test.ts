import assert from "node:assert/strict";
import { test } from "node:test";
import { seasons } from "./frontend";
import { rosterSeasons } from "./nhlContractAnalytics";
import { builderSeasons, builderContext } from "./schedule";
import { overview } from "./accounts";
import { readInventory } from "./gshlImpactRatings";
import {
  mutationFixture,
  invokeMutation,
} from "../tools/testing/convexMutationFixture";

void test("fantasy facades filter reference years before take; NHL-specific history remains visible", async () => {
  const f = mutationFixture();
  f.put("seasons", "nhl", {
    year: "2013",
    name: "2012-13",
    startDate: "2012-10-01",
    nhlOnly: true,
  });
  f.put("seasons", "fantasy", {
    year: "2015",
    name: "2014-15",
    startDate: "2014-10-01",
  });
  f.put("playerNhlStatLines", "nhl-stats", {
    seasonId: "nhl",
    playerId: "person",
    GP: 10,
  });
  const listed = await invokeMutation(seasons, f.ctx, {
    orderBy: { year: "asc" },
    take: 1,
  });
  assert.deepEqual(listed, [
    { id: "fantasy", year: "2015", name: "2014-15", startDate: "2014-10-01" },
  ]);
  assert.deepEqual(
    await invokeMutation(seasons, f.ctx, { where: { id: "nhl" } }),
    [],
  );
  assert.deepEqual(await invokeMutation(rosterSeasons, f.ctx, {}), [
    { id: "nhl", seasonStartYear: 2012 },
  ]);
  assert.deepEqual(await invokeMutation(builderSeasons, f.ctx, {}), [
    { id: "fantasy", name: "2014-15" },
  ]);
  assert.deepEqual(await invokeMutation(overview, f.ctx, {}), {
    owners: [],
    seasons: [{ _id: "fantasy", name: "2014-15" }],
  });
  await assert.rejects(
    () => invokeMutation(builderContext, f.ctx, { seasonId: "nhl" }),
    /Fantasy season/,
  );
});

void test("extra NHL-only years do not truncate the bounded GSHL rating inventory", async () => {
  const previous = process.env.CONVEX_SERVER_SECRET;
  process.env.CONVEX_SERVER_SECRET = "test-scope-secret";
  try {
    const f = mutationFixture();
    for (let i = 0; i < 5; i++)
      f.put("seasons", `nhl-${i}`, { year: String(2009 + i), nhlOnly: true });
    for (let i = 0; i < 16; i++)
      f.put("seasons", `fantasy-${i}`, { year: String(2014 + i) });
    const inventory = await invokeMutation(readInventory, f.ctx, {
      serverSecret: "test-scope-secret",
    });
    assert.deepEqual(inventory, {
      seasons: Array.from({ length: 16 }, (_, i) => f.get(`fantasy-${i}`)),
      weeks: [],
      teams: [],
    });
    f.put("seasons", "extra-fantasy", { year: "2030" });
    await assert.rejects(
      () =>
        invokeMutation(readInventory, f.ctx, {
          serverSecret: "test-scope-secret",
        }),
      /reviewed bounds/,
    );
  } finally {
    if (previous === undefined) delete process.env.CONVEX_SERVER_SECRET;
    else process.env.CONVEX_SERVER_SECRET = previous;
  }
});
