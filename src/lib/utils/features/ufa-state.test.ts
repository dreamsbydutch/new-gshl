import assert from "node:assert/strict";
import test from "node:test";

import { normalizeUfaPublicState } from "./ufa-state";

void test("normalizes the untyped public UFA query boundary", () => {
  const state = normalizeUfaPublicState({
    groups: [
      {
        _id: "group-1",
        playerId: "player-1",
        deadlineAt: 123,
        status: "open",
      },
      null,
    ],
    offers: [
      {
        id: "offer-1",
        groupId: "group-1",
        franchiseId: "franchise-1",
        contractLength: 2,
        salary: 4_500_000,
        status: "pending",
        isMine: true,
      },
    ],
    oddsByGroup: {
      "group-1": [{ offerId: "offer-1", probability: 0.75 }],
    },
  });

  assert.deepEqual(state.groups, [
    {
      _id: "group-1",
      id: "group-1",
      playerId: "player-1",
      deadlineAt: 123,
      status: "open",
    },
  ]);
  assert.equal(state.offers[0]?.isMine, true);
  assert.equal(state.oddsByGroup["group-1"]?.[0]?.probability, 0.75);
});

void test("returns an empty state for malformed input", () => {
  assert.deepEqual(normalizeUfaPublicState(null), {
    groups: [],
    offers: [],
    oddsByGroup: {},
  });
});
