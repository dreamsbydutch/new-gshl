import assert from "node:assert/strict";
import test from "node:test";
import { planDailyRosterMaintenance } from "./daily-roster-maintenance";
import { getLineupBuilder } from "../lineup/lineup-builder";

type Input = Parameters<typeof planDailyRosterMaintenance>[0];
function fixture(): Input {
  return {
    date: "2026-09-29",
    today: "2026-09-29",
    seasonId: "s",
    seasons: [
      { id: "s", year: 2027, endDate: "2027-04-19" },
      { id: "next", year: 2028, endDate: "2028-04-19" },
    ],
    teams: [{ id: "t", seasonId: "s", franchiseId: "f" }],
    franchises: [{ id: "f", ownerId: "o" }],
    players: [
      {
        id: "p",
        fullName: "Rostered",
        ownerId: "o",
        nhlPos: ["C"],
        lineupPos: "BN",
        seasonRating: 90,
      },
      {
        id: "drop",
        fullName: "Dropped",
        ownerId: "o",
        gshlTeamId: "t",
        lineupPos: "LW",
      },
    ],
    contracts: [
      {
        id: "c",
        playerId: "drop",
        ownerId: "o",
        contractType: "STANDARD",
        signingDate: "2026-06-16",
        expiryDate: "2027-04-19",
        expiryStatus: "RFA",
        contractSalary: 3750000,
        capHit: 3750000,
        capHitEndDate: "2027-04-19",
      },
    ],
    days: [
      {
        playerId: "p",
        gshlTeamId: "t",
        seasonId: "s",
        weekId: "w",
        date: "2026-09-29",
        dailyPos: "IR+",
        nhlPos: ["LW"],
        posGroup: "F",
      },
    ],
    findBestLineup: (players) =>
      Object.fromEntries(
        players.slice(0, 1).map((p) => [String(p.playerId), "LW"]),
      ),
  };
}

test("current ownership/eligibility and optimizer are separate from Yahoo daily slots; buyouts are idempotent", async () => {
  const input = fixture();
  const builder = await getLineupBuilder();
  const slots = builder.buildLineupStructureFromRosterSpots!(["LW", "BN"]);
  input.findBestLineup = (players) =>
    builder.findBestLineup(players as never, false, slots);
  const original = JSON.stringify(input);
  const result = planDailyRosterMaintenance(input);
  assert.deepEqual(result.conflicts, []);
  assert.equal(
    result.playerUpdates.find((p) => p.id === "p")?.data.lineupPos,
    "LW",
  );
  assert.equal(
    result.playerUpdates.find((p) => p.id === "drop")?.data.ownerId,
    null,
  );
  assert.equal(input.days[0]?.dailyPos, "IR+");
  assert.deepEqual(result.buyouts[0]?.data, {
    expiryStatus: "Buyout",
    expiryDate: "2026-09-29",
    capHit: 1875000,
    capHitEndDate: "2028-04-19",
  });
  assert.equal(JSON.stringify(input), original);
  for (const update of result.playerUpdates)
    Object.assign(input.players.find((p) => p.id === update.id)!, update.data);
  for (const update of result.buyouts)
    Object.assign(
      input.contracts.find((c) => c.id === update.id)!,
      update.data,
    );
  const repeated = planDailyRosterMaintenance(input);
  assert.deepEqual(repeated.playerUpdates, []);
  assert.deepEqual(repeated.buyouts, []);
});

test("multi-year buyout keeps the original cap end and salary", () => {
  const input = fixture();
  Object.assign(input.contracts[0]!, {
    expiryDate: "2028-04-19",
    capHitEndDate: "2028-04-19",
  });
  const buyout = planDailyRosterMaintenance(input).buyouts[0]!;
  assert.equal(buyout.data.capHitEndDate, "2028-04-19");
  assert.equal("contractSalary" in buyout.data, false);
});

test("bench/injured roster members are not drops, transfers require review, former owners are excluded", () => {
  const input = fixture();
  input.contracts[0]!.playerId = "p";
  for (const slot of ["BN", "IR", "IR+"]) {
    input.days[0]!.dailyPos = slot;
    assert.equal(planDailyRosterMaintenance(input).buyouts.length, 0);
  }
  input.teams.push({ id: "t2", seasonId: "s", franchiseId: "f2" });
  input.franchises.push({ id: "f2", ownerId: "o2" });
  input.days.push({ ...input.days[0]!, playerId: "drop" });
  input.days[0]!.gshlTeamId = "t2";
  assert.match(
    planDailyRosterMaintenance(input).conflicts[0]!,
    /another owner/,
  );
  input.contracts[0]!.ownerId = "former-owner";
  assert.deepEqual(planDailyRosterMaintenance(input).conflicts, []);
  assert.equal(planDailyRosterMaintenance(input).buyouts.length, 0);
});

test("historical dates, missing teams and duplicate assignments cannot trigger maintenance", () => {
  const input = fixture();
  assert.throws(
    () => planDailyRosterMaintenance({ ...input, date: "2026-09-28" }),
    /today/,
  );
  assert.throws(
    () => planDailyRosterMaintenance({ ...input, days: [] }),
    /coverage/,
  );
  assert.throws(
    () =>
      planDailyRosterMaintenance({
        ...input,
        days: [...input.days, ...input.days],
      }),
    /duplicate/,
  );
  input.seasons.pop();
  assert.match(planDailyRosterMaintenance(input).conflicts[0]!, /end date/);
});

test("expired, future unsigned and ended contracts do not create repeat charges", () => {
  for (const patch of [
    { expiryDate: "2026-04-19" },
    { signingDate: "2026-10-01" },
    ...["Buyout", "Trade", "Retired", "Injured"].map((expiryStatus) => ({
      expiryStatus,
    })),
  ]) {
    const input = fixture();
    Object.assign(input.contracts[0]!, patch);
    assert.equal(planDailyRosterMaintenance(input).buyouts.length, 0);
  }
});
