import assert from "node:assert/strict";
import test from "node:test";
import { withPuckPediaCaptureRecovery } from "./puckpedia-capture-retry";

test("restarts the capture after the reported aborted navigation and page-loader errors", async () => {
  const errors = [
    "net::ERR_ABORTED at https://puckpedia.com/players/search",
    "[player-bio-sync] PuckPedia's own page loader failed for skaters page 1.",
  ];
  let attempts = 0;
  const delays: number[] = [];
  const result = await withPuckPediaCaptureRecovery(
    async () => {
      const message = errors[attempts++];
      if (message) throw new Error(message);
      return { complete: true };
    },
    async (ms) => {
      delays.push(ms);
    },
  );
  assert.deepEqual(result, { complete: true });
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [3000, 6000]);
});

test("stops after three attempts and preserves the final source error", async () => {
  let attempts = 0;
  await assert.rejects(
    withPuckPediaCaptureRecovery(
      async () => {
        attempts++;
        throw new Error(
          "net::ERR_ABORTED at https://puckpedia.com/players/search",
        );
      },
      async () => {},
    ),
    /ERR_ABORTED/,
  );
  assert.equal(attempts, 3);
});

test("does not retry verification, incomplete directories or closed browsers", async () => {
  for (const message of [
    "Complete any verification in the worker browser",
    "PuckPedia repeated a skaters page",
    "Target closed",
  ]) {
    let attempts = 0;
    await assert.rejects(
      withPuckPediaCaptureRecovery(
        async () => {
          attempts++;
          throw new Error(message);
        },
        async () => {
          throw new Error("Unexpected retry");
        },
      ),
      (error: unknown) => error instanceof Error && error.message === message,
    );
    assert.equal(attempts, 1);
  }
});
