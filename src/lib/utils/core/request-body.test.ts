import assert from "node:assert/strict";
import test from "node:test";
import { readLimitedRequestText, RequestBodyError } from "./request-body";

void test("rejects oversized chunked bodies and cancels before consuming the rest", async () => {
  let cancelled = false;
  const request = new Request("https://gshl.test", {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(5));
        controller.enqueue(new Uint8Array(5));
      },
      cancel() {
        cancelled = true;
      },
    }),
    duplex: "half",
  } as RequestInit);
  await assert.rejects(
    readLimitedRequestText(request, 8),
    (error: unknown) =>
      error instanceof RequestBodyError && error.status === 413,
  );
  assert.equal(cancelled, true);
});

void test("limits bytes rather than characters and preserves split UTF-8", async () => {
  await assert.rejects(
    readLimitedRequestText(
      new Request("https://gshl.test", {
        method: "POST",
        body: "ééé",
      }),
      5,
    ),
    (error: unknown) =>
      error instanceof RequestBodyError && error.status === 413,
  );
  const bytes = new TextEncoder().encode("é");
  const request = new Request("https://gshl.test", {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0, 1));
        controller.enqueue(bytes.slice(1));
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit);
  assert.equal(await readLimitedRequestText(request, 2), "é");
});

void test("handles declared sizes, empty bodies and failed reads", async () => {
  await assert.rejects(
    readLimitedRequestText(
      new Request("https://gshl.test", {
        method: "POST",
        headers: { "content-length": "100" },
        body: "x",
      }),
      8,
    ),
    (error: unknown) =>
      error instanceof RequestBodyError && error.status === 413,
  );
  assert.equal(
    await readLimitedRequestText(new Request("https://gshl.test"), 8),
    "",
  );
  const request = new Request("https://gshl.test", {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        controller.error(new Error("disconnected"));
      },
    }),
    duplex: "half",
  } as RequestInit);
  await assert.rejects(
    readLimitedRequestText(request, 8),
    (error: unknown) =>
      error instanceof RequestBodyError && error.status === 400,
  );
});
