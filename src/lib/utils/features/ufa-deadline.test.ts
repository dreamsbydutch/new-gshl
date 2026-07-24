import assert from "node:assert/strict";
import test from "node:test";
import { getUfaOfferGroupDeadline, UFA_OFFER_MS } from "./ufa-deadline";

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
