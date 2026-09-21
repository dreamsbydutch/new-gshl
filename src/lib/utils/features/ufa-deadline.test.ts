import assert from "node:assert/strict";
import test from "node:test";
import {
  getUfaOfferGroupDeadline,
  isUfaOfferWindowOpen,
  resolveUfaSigningSeason,
  UFA_OFFER_MS,
} from "./ufa-deadline";

void test("offer window respects Toronto midnight, the draft instant, and missing dates", () => {
  const draft = "2026-09-20T23:00:00Z";
  for (const [now, expected] of [
    ["2026-07-01T03:59:59Z", false],
    ["2026-07-01T04:00:00Z", true],
    ["2026-09-20T22:59:59Z", true],
    [draft, false],
    ["2026-12-01T12:00:00Z", false],
  ] as const) {
    assert.equal(
      isUfaOfferWindowOpen("2026-06-30", draft, Date.parse(now)),
      expected,
    );
  }
  assert.equal(isUfaOfferWindowOpen("2026-06-30", null), false);
  assert.equal(isUfaOfferWindowOpen(null, draft), false);
  assert.equal(isUfaOfferWindowOpen("2026-06-30", "invalid"), false);
});

void test("the offseason preview advances at the draft even if the active flag is stale", () => {
  const prior = {
    year: 2026,
    isActive: true,
    startDate: "2025-10-01",
    draftStartAt: "2025-09-20",
  };
  const current = {
    year: 2027,
    isActive: false,
    startDate: "2026-10-01",
    draftStartAt: "2026-09-20T23:00:00Z",
  };
  const future = {
    year: 2028,
    startDate: "2027-10-01",
    draftStartAt: "2027-09-20",
  };
  const seasons = [future, prior, current];
  assert.equal(
    resolveUfaSigningSeason(seasons, Date.parse("2026-09-20T22:59:59Z")),
    prior,
  );
  assert.equal(
    resolveUfaSigningSeason(seasons, Date.parse("2026-09-20T23:00:00Z")),
    current,
  );
  assert.equal(
    resolveUfaSigningSeason(seasons, Date.parse("2027-02-01")),
    current,
  );
  assert.deepEqual(seasons, [future, prior, current]);
});

void test("the first UFA offer opens a seven-day bidding window", () => {
  const firstOfferAt = Date.parse("2026-07-01T12:00:00.000Z");

  assert.equal(
    getUfaOfferGroupDeadline({ submittedAt: firstOfferAt }),
    firstOfferAt + UFA_OFFER_MS,
  );
});

void test("later UFA offers keep the deadline from the first offer", () => {
  const firstOfferAt = Date.parse("2026-07-01T12:00:00.000Z");
  const laterOfferAt = Date.parse("2026-07-06T12:00:00.000Z");

  assert.equal(
    getUfaOfferGroupDeadline({
      submittedAt: laterOfferAt,
      existingDeadlineAt: laterOfferAt + UFA_OFFER_MS,
      existingOfferSubmittedAt: [firstOfferAt],
    }),
    firstOfferAt + UFA_OFFER_MS,
  );
});

void test("a later UFA offer never extends an earlier stored deadline", () => {
  const firstOfferAt = Date.parse("2026-07-01T12:00:00.000Z");
  const earlierDeadlineAt = Date.parse("2026-07-07T12:00:00.000Z");

  assert.equal(
    getUfaOfferGroupDeadline({
      submittedAt: Date.parse("2026-07-03T12:00:00.000Z"),
      existingDeadlineAt: earlierDeadlineAt,
      existingOfferSubmittedAt: [firstOfferAt],
    }),
    earlierDeadlineAt,
  );
});
