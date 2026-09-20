import assert from "node:assert/strict";
import { test } from "node:test";
import type { Id } from "./_generated/dataModel";
import { createContract } from "./frontend";
import { finalizeGroup } from "./ufa";
import {
  mutationFixture,
  invokeMutation,
} from "../tools/testing/convexMutationFixture";

function signingFixture() {
  const f = mutationFixture();
  f.put("seasons", "signing", {
    year: 2026,
    isActive: true,
    signingEndDate: "2020-07-01",
  });
  for (let i = 1; i <= 3; i++) {
    f.put("seasons", "season" + i, {
      year: 2026 + i,
      startDate: 2026 + i + "-10-01",
      endDate: 2027 + i + "-06-01",
    });
    f.put("teams", "team" + i, {
      seasonId: "season" + i,
      franchiseId: "franchise",
    });
    for (const round of [1, 5])
      f.put("draftPicks", "pick" + i + ":" + round, {
        seasonId: "season" + i,
        gshlTeamId: "team" + i,
        round,
        pick: round * 10,
        playerId: null,
        isSigning: false,
        onClockStartedAt: 123,
        onClockExpiresAt: 456,
      });
  }
  f.put("teams", "currentTeam", {
    seasonId: "signing",
    franchiseId: "franchise",
  });
  f.put("franchises", "franchise", { ownerId: "owner" });
  f.put("players", "player", {
    fullName: "Signing Player",
    isActive: true,
    isSignable: true,
    isResignable: "UFA",
    salary: 1_000_000,
    nhlPos: ["C"],
    overallRating: 80,
  });
  f.put("players", "teammate", {
    ownerId: "owner",
    gshlTeamId: "currentTeam",
    isActive: true,
    nhlPos: ["D"],
    overallRating: 70,
  });
  f.put("players", "unrelated", {
    ownerId: "otherOwner",
    gshlTeamId: "otherTeam",
    isActive: true,
    nhlPos: ["G"],
    lineupPos: "G",
  });
  f.put("ufaOfferGroups", "group", {
    playerId: "player",
    seasonId: "signing",
    status: "open",
    deadlineAt: 0,
  });
  f.put("ufaOffers", "winner", {
    groupId: "group",
    ownerId: "owner",
    playerId: "player",
    status: "pending",
    contractLength: 2,
    salary: 2_000_000,
  });
  f.put("ufaOffers", "loser", {
    groupId: "group",
    ownerId: "otherOwner",
    playerId: "player",
    status: "pending",
    contractLength: 1,
    salary: 1_000_000,
  });
  return f;
}

const commissionerArgs = {
  teamId: "currentTeam",
  playerId: "player",
  contractLength: 2,
};
const ufaArgs = {
  groupId: "group",
  roll: 0.1,
  odds: [{ offerId: "winner", probability: 1 }],
  factorSnapshots: [{ offerId: "winner", snapshot: "{}" }],
};

for (const [label, fn, args] of [
  ["commissioner", createContract, commissionerArgs],
  ["UFA", finalizeGroup, ufaArgs],
] as const) {
  void test(
    label +
      " signing reserves picks, assigns ownership, and rebuilds the first covered roster",
    async () => {
      const f = signingFixture();
      await invokeMutation(fn, f.ctx, args);
      const contract = f.rows("contracts")[0]!;
      assert.equal(contract.ownerId, "owner");
      assert.equal(contract.seasonId, "signing");
      assert.equal(contract.contractLength, 2);
      const signingDay = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Toronto",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      assert.equal(
        contract.startDate,
        Date.parse(label === "UFA" ? "2027-10-01" : signingDay),
      );
      assert.equal(contract.expiryDate, Date.parse("2029-06-01"));
      assert.equal(contract.capHit, contract.contractSalary);
      assert.equal(contract.capHitEndDate, contract.expiryDate);
      assert.equal(contract.contractType, "STANDARD");
      assert.equal(contract.expiryStatus, "RFA");
      assert.equal(contract.signingStatus, "UFA");
      assert.equal(
        contract.contractSalary,
        label === "UFA" ? 2_000_000 : 1_250_000,
      );
      assert.equal(f.get("player")?.ownerId, "owner");
      assert.equal(f.get("player")?.gshlTeamId, "team1");
      assert.equal(f.get("player")?.isSignable, false);
      assert.ok(f.get("player")?.lineupPos);
      assert.equal(f.get("teammate")?.gshlTeamId, "team1");
      assert.equal(f.get("unrelated")?.gshlTeamId, "otherTeam");
      for (let i = 1; i <= 2; i++) {
        assert.equal(f.get("pick" + i + ":5")?.playerId, "player");
        assert.equal(f.get("pick" + i + ":5")?.isSigning, true);
        assert.equal(f.get("pick" + i + ":5")?.onClockStartedAt, null);
        assert.equal(f.get("pick" + i + ":5")?.onClockExpiresAt, null);
        assert.equal(f.get("pick" + i + ":1")?.playerId, null);
      }
      assert.equal(f.get("pick3:5")?.playerId, null);
      if (label === "UFA") {
        assert.equal(contract.contractSalary, 2_000_000);
        assert.equal(contract.signingStatus, "UFA");
        assert.equal(f.get("group")?.status, "resolved");
        assert.equal(f.get("winner")?.status, "won");
        assert.equal(f.get("loser")?.status, "lost");
        await invokeMutation(fn, f.ctx, args);
        assert.equal(f.rows("contracts").length, 1);
      } else {
        await assert.rejects(
          invokeMutation(fn, f.ctx, args),
          /already has a contract/,
        );
      }
    },
  );

  void test(
    label + " validates every covered season before any signing write",
    async () => {
      const f = signingFixture();
      for (const round of [1, 5])
        await f.ctx.db.patch(("pick2:" + round) as never, {
          playerId: "taken" as never,
        });
      const before = structuredClone(f.get("player"));
      await assert.rejects(
        invokeMutation(fn, f.ctx, args),
        /No available draft pick/,
      );
      assert.deepEqual(f.get("player"), before);
      assert.equal(f.rows("contracts").length, 0);
      assert.equal(f.get("pick1:5")?.playerId, null);
      assert.equal(f.get("group")?.status, "open");
      assert.equal(f.get("winner")?.status, "pending");
    },
  );

  void test(
    label + " rejects missing future teams and invalid dates before writes",
    async () => {
      for (const invalidDate of [false, true]) {
        const f = signingFixture();
        if (invalidDate)
          await f.ctx.db.patch("season2" as never, { endDate: "invalid-date" });
        else
          await f.ctx.db.patch("team2" as never, {
            franchiseId: "otherFranchise" as never,
          });
        await assert.rejects(invokeMutation(fn, f.ctx, args));
        assert.equal(f.rows("contracts").length, 0);
        assert.equal(f.get("pick1:5")?.playerId, null);
        assert.equal(f.get("player")?.isSignable, true);
      }
    },
  );
}

void test("commissioner signing rejects anonymous and owner callers", async () => {
  const f = signingFixture();
  f.signIn(null);
  await assert.rejects(
    invokeMutation(createContract, f.ctx, commissionerArgs),
    /Unauthenticated/,
  );
  f.put("authUsers", "ownerUser", {
    role: "owner",
    status: "active",
    ownerId: "owner",
  });
  f.signIn("ownerUser");
  await assert.rejects(
    invokeMutation(createContract, f.ctx, commissionerArgs),
    /Forbidden/,
  );
  assert.equal(f.rows("contracts").length, 0);
});

void test("commissioner retains draft and RFA terms before free agency", async () => {
  for (const status of ["DRAFT", "RFA"] as const) {
    const f = signingFixture();
    await f.ctx.db.patch("signing" as never, { signingEndDate: "2999-07-01" });
    await f.ctx.db.patch("player" as never, { isResignable: status });
    await invokeMutation(createContract, f.ctx, commissionerArgs);
    const contract = f.rows("contracts")[0]!;
    assert.equal(
      contract.contractSalary,
      status === "DRAFT" ? 1_000_000 : 1_150_000,
    );
    assert.equal(
      contract.contractType,
      status === "DRAFT" ? "STANDARD" : "EXTENSION",
    );
    assert.equal(
      contract.signingStatus,
      status === "DRAFT" ? "Drafted" : "RFA",
    );
    assert.equal(contract.expiryStatus, status === "DRAFT" ? "RFA" : "UFA");
  }
});

void test("UFA retains extension terms when the prior contract covers the signing season", async () => {
  const f = signingFixture();
  f.put("seasons", "priorSeason", { year: 2025 });
  f.put("contracts", "priorContract", {
    playerId: "player",
    ownerId: "owner",
    seasonId: "priorSeason",
    contractLength: 1,
    contractType: "STANDARD",
    expiryStatus: "UFA",
    expiryDate: "2020-06-01",
  });
  await invokeMutation(finalizeGroup, f.ctx, ufaArgs);
  const contract = f
    .rows("contracts")
    .find((row) => row.seasonId === "signing")!;
  assert.equal(contract.contractType, "EXTENSION");
  assert.equal(contract.expiryStatus, "UFA");
  assert.equal(contract.contractSalary, 2_000_000);
});

void test("UFA rejects a stale winner or newly contracted player before signing writes", async () => {
  for (const alreadyContracted of [false, true]) {
    const f = signingFixture();
    if (alreadyContracted) {
      f.put("contracts", "existingContract", {
        playerId: "player",
        seasonId: "signing",
        contractLength: 1,
        contractType: "STANDARD",
        expiryStatus: "RFA",
        expiryDate: "2028-06-01",
      });
    } else {
      await f.ctx.db.patch("winner" as Id<"ufaOffers">, { status: "lost" });
    }
    await assert.rejects(
      invokeMutation(finalizeGroup, f.ctx, ufaArgs),
      /winning contract/,
    );
    assert.equal(f.rows("contracts").length, alreadyContracted ? 1 : 0);
    assert.equal(f.get("pick1:5")?.playerId, null);
    assert.equal(f.get("player")?.isSignable, true);
    assert.equal(f.get("group")?.status, "open");
  }
});
