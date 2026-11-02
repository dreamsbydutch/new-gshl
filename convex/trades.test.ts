import assert from "node:assert/strict";
import test from "node:test";
import {
  mutationFixture,
  invokeMutation,
} from "../tools/testing/convexMutationFixture";
import {
  prepareTrade,
  playingTradeContract,
  type TradeRequest,
} from "./lib/tradeTransaction";
import { record } from "./trades";
import { getTorontoDate } from "../src/lib/utils/domain/contracts";
import { projectTrade } from "./lib/tradeProjection";
import type { Doc } from "./_generated/dataModel";

function fixture() {
  const f = mutationFixture();
  const today = getTorontoDate(),
    year = Number(today.slice(0, 4));
  for (const [id, y] of [
    ["current", year],
    ["future", year + 1],
  ] as const)
    f.put("seasons", id, {
      year: y,
      name: String(y),
      startDate: `${y}-01-01`,
      endDate: `${y}-12-31`,
      isActive: id === "current",
      draftStartAt: Date.now() + 365 * 86400000,
    });
  for (const side of ["A", "B"]) {
    f.put("franchises", "franchise" + side, {
      ownerId: "owner" + side,
      name: "Team " + side,
      logoUrl: null,
    });
    for (const season of ["current", "future"])
      f.put("teams", season + side, {
        seasonId: season,
        franchiseId: "franchise" + side,
      });
    f.put("players", "player" + side, {
      ownerId: "owner" + side,
      gshlTeamId: "current" + side,
      fullName: "Player " + side,
      isActive: true,
      nhlPos: ["C"],
      lineupPos: "C",
      overallRating: 50,
    });
    f.put("contracts", "contract" + side, {
      ownerId: "owner" + side,
      playerId: "player" + side,
      seasonId: "current",
      contractType: "STANDARD",
      contractLength: 2,
      contractSalary: side === "A" ? 5000000 : 3000000,
      capHit: side === "A" ? 5000000 : 3000000,
      signingStatus: "RFA",
      expiryStatus: "UFA",
      signingDate: `${year - 1}-06-01`,
      startDate: `${year}-01-01`,
      expiryDate: `${year + 1}-12-31`,
      capHitEndDate: `${year + 1}-12-31`,
    });
    for (const round of [1, 5])
      f.put("draftPicks", side + round, {
        seasonId: "future",
        gshlTeamId: "future" + side,
        originalTeamId: "future" + side,
        round,
        pick: 1,
        playerId: round === 5 ? "player" + side : null,
        isSigning: round === 5,
        isTraded: false,
        onClockStartedAt: null,
        onClockExpiresAt: null,
        onClockEndedAt: null,
      });
  }
  const request = {
    seasonId: "current",
    teamAId: "currentA",
    teamBId: "currentB",
    effectiveDate: today,
    playerIdsA: ["playerA"],
    playerIdsB: ["playerB"],
    pickIdsA: ["A1"],
    pickIdsB: [],
    notes: "Agreed deal",
  } as unknown as TradeRequest;
  return { f, request };
}

void test("live contract signing instants use the Toronto trade date", () => {
  const contract = {
    contractType: "STANDARD",
    expiryStatus: "UFA",
    signingDate: Date.parse("2026-11-02T02:00:00Z"),
    expiryDate: "2027-06-01",
  } as Doc<"contracts">;
  assert.equal(playingTradeContract(contract, "2026-11-01"), true);
  assert.equal(playingTradeContract(contract, "2026-10-31"), false);
});
async function execute(
  f: ReturnType<typeof mutationFixture>,
  request: TradeRequest,
  requestId = "one",
) {
  const preview = await prepareTrade(f.ctx, request);
  const args = { ...request, requestId, expectedVersion: preview.version };
  return { id: await invokeMutation(record, f.ctx, args), args, preview };
}

void test("one trade preserves contract terms, transfers future picks, reallocates keeper picks and updates both rosters", async () => {
  const { f, request } = fixture();
  const before = { ...f.get("contractA") };
  const { args } = await execute(f, request);
  assert.equal(f.get("contractA")?.ownerId, "ownerB");
  for (const key of Object.keys(before).filter(
    (k) => !["ownerId", "updatedAt"].includes(k),
  ))
    assert.deepEqual(f.get("contractA")?.[key], before[key]);
  assert.equal(f.get("contractB")?.ownerId, "ownerA");
  assert.equal(f.get("A1")?.gshlTeamId, "futureB");
  assert.equal(f.get("A1")?.originalTeamId, "futureA");
  assert.equal(f.get("A1")?.isTraded, true);
  assert.equal(f.get("A5")?.playerId, "playerB");
  assert.equal(f.get("B5")?.playerId, "playerA");
  assert.equal(f.get("playerA")?.gshlTeamId, "currentB");
  assert.equal(f.get("playerB")?.ownerId, "ownerA");
  assert.equal(f.rows("trades").length, 1);
  const publicTrade = projectTrade(
    f.rows("trades")[0] as unknown as Doc<"trades">,
  );
  assert.equal(publicTrade.players.length, 2);
  assert.equal(publicTrade.picks.length, 1);
  assert.equal("contractTransfers" in publicTrade, false);
  assert.equal("createdBy" in publicTrade, false);
  assert.equal("pickChanges" in publicTrade, false);
  assert.equal((f.rows("trades")[0]?.pickChanges as unknown[]).length, 3);
  assert.equal(f.rows("trades")[0]?.players instanceof Array, true);
  await invokeMutation(record, f.ctx, args);
  assert.equal(
    f.rows("trades").length,
    1,
    "network retries must not execute the trade twice",
  );
});

void test("accepts a roster already updated by Yahoo and moves the outstanding contract", async () => {
  const { f, request } = fixture();
  Object.assign(f.get("playerA")!, {
    ownerId: "ownerB",
    gshlTeamId: "currentB",
  });
  await execute(f, request);
  assert.equal(f.get("contractA")?.ownerId, "ownerB");
  assert.equal(f.get("playerA")?.gshlTeamId, "currentB");
});

void test("cap failures and missing keeper picks are rejected before any writes", async () => {
  for (const failure of ["cap", "picks"]) {
    const { f, request } = fixture();
    request.playerIdsB = [];
    if (failure === "cap")
      Object.assign(f.get("contractB")!, {
        contractSalary: 23000000,
        capHit: 23000000,
      });
    else
      for (const id of ["A1", "B1", "B5"])
        Object.assign(f.get(id)!, { isSigning: true, playerId: "other" });
    if (failure === "picks") request.pickIdsA = [];
    const before = JSON.stringify([
      f.rows("contracts"),
      f.rows("players"),
      f.rows("draftPicks"),
    ]);
    await assert.rejects(
      () => execute(f, request),
      failure === "cap" ? /salary cap/ : /keeper pick/,
    );
    assert.equal(
      JSON.stringify([
        f.rows("contracts"),
        f.rows("players"),
        f.rows("draftPicks"),
      ]),
      before,
    );
    assert.equal(f.rows("trades").length, 0);
  }
});

void test("rejects unauthorized, stale, duplicate, third-team and reserved-pick requests", async () => {
  {
    const { f, request } = fixture();
    const plan = await prepareTrade(f.ctx, request);
    const args = {
      ...request,
      expectedVersion: plan.version,
      requestId: "one",
    };
    f.signIn(null);
    await assert.rejects(
      () => invokeMutation(record, f.ctx, args),
      /Unauthenticated/,
    );
    f.signIn("commissioner");
    f.put("authUsers", "ownerUser", { role: "owner", status: "active" });
    f.signIn("ownerUser");
    await assert.rejects(
      () => invokeMutation(record, f.ctx, args),
      /Forbidden/,
    );
    f.signIn("commissioner");
    Object.assign(f.get("A1")!, { round: 2 });
    await assert.rejects(() => invokeMutation(record, f.ctx, args), /changed/);
    assert.equal(f.rows("trades").length, 0);
  }
  for (const failure of ["duplicate", "third-team", "reserved"]) {
    const { f, request } = fixture();
    if (failure === "duplicate") request.playerIdsB = [...request.playerIdsA];
    if (failure === "third-team") f.get("playerA")!.ownerId = "outside";
    if (failure === "reserved")
      request.pickIdsA = ["A5"] as typeof request.pickIdsA;
    await assert.rejects(
      () => execute(f, request),
      failure === "duplicate"
        ? /unique/
        : failure === "third-team"
          ? /third team/
          : /unreserved/,
    );
    assert.equal(f.rows("trades").length, 0);
  }
});

void test("picks-only trades leave contracts and rosters untouched", async () => {
  const { f, request } = fixture();
  request.playerIdsA = [];
  request.playerIdsB = [];
  const before = JSON.stringify([f.rows("players"), f.rows("contracts")]);
  const { args } = await execute(f, request);
  assert.equal(
    JSON.stringify([f.rows("players"), f.rows("contracts")]),
    before,
  );
  assert.equal(f.get("A1")?.gshlTeamId, "futureB");
  assert.equal(f.get("A5")?.playerId, "playerA");
  await assert.rejects(
    () => invokeMutation(record, f.ctx, { ...args, notes: "Different deal" }),
    /another trade/,
  );
});

void test("buyout cap charges stay with their original owner when that player is traded", async () => {
  const { f, request } = fixture();
  f.put("contracts", "buyout", {
    ...f.get("contractA")!,
    _id: "buyout",
    expiryStatus: "Buyout",
    contractSalary: 1000000,
    capHit: 500000,
  });
  await execute(f, request);
  assert.equal(f.get("buyout")?.ownerId, "ownerA");
  assert.equal(f.get("contractA")?.ownerId, "ownerB");
});

void test("rejects active draft clocks, missing receiving teams and overlapping contracts", async () => {
  for (const failure of ["clock", "team", "overlap"]) {
    const { f, request } = fixture();
    if (failure === "clock")
      f.get("A1")!.onClockExpiresAt = Date.now() + 100000;
    if (failure === "team") f.get("futureB")!.franchiseId = "third";
    if (failure === "overlap")
      f.put("contracts", "overlap", { ...f.get("contractA")!, _id: "overlap" });
    await assert.rejects(
      () => execute(f, request),
      failure === "clock"
        ? /unreserved/
        : failure === "team"
          ? /receiving owner/
          : /overlapping/,
    );
    assert.equal(f.rows("trades").length, 0);
    assert.equal(f.get("contractA")?.ownerId, "ownerA");
  }
});
