import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInternalCallbackPath,
  resolveRequestCallbackPath,
  resolveSafeCallbackPath,
} from "./auth-callback";

void test("uses the first forwarded origin and preserves callback context", () => {
  const headers = new Headers({
    host: "internal.test:3000",
    "x-forwarded-host": " gshl.test , proxy.test ",
    "x-forwarded-proto": " https , http ",
  });
  assert.equal(
    resolveRequestCallbackPath(
      "https://gshl.test/draft/teams?owner=owner-4#roster",
      headers,
    ),
    "/draft/teams?owner=owner-4#roster",
  );
  assert.equal(
    resolveRequestCallbackPath("http://internal.test:3000/draft", headers),
    "/lockerroom",
  );
});

void test("falls back to the host with HTTPS, or HTTP for localhost", () => {
  for (const [host, origin] of [
    ["gshl.test", "https://gshl.test"],
    ["localhost:3000", "http://localhost:3000"],
  ] as const) {
    assert.equal(
      resolveRequestCallbackPath(
        `${origin}/draft?view=teams`,
        new Headers({ host }),
      ),
      "/draft?view=teams",
    );
  }
  assert.equal(
    resolveRequestCallbackPath(
      "https://localhost:3000/draft",
      new Headers({ host: "localhost:3000", "x-forwarded-proto": "https" }),
    ),
    "/draft",
  );
});

void test("uses the fallback for missing or malformed request origins", () => {
  for (const headers of [
    new Headers(),
    new Headers({ host: "gshl.test", "x-forwarded-host": "" }),
    new Headers({ host: "gshl.test", "x-forwarded-proto": "" }),
    new Headers({ host: "not a host" }),
  ]) {
    assert.equal(resolveRequestCallbackPath("/draft", headers), "/lockerroom");
  }
});

void test("request callback preparation still rejects unsafe destinations", () => {
  const headers = new Headers({ host: "gshl.test" });
  for (const callback of [
    undefined,
    "https://other.test/draft",
    "//other.test",
    "javascript:alert(1)",
    "/\\other.test",
  ]) {
    assert.equal(resolveRequestCallbackPath(callback, headers), "/lockerroom");
  }
});

void test("reconstructs protected paths with encoded and repeated query values", () => {
  assert.equal(
    buildInternalCallbackPath("/draft/teams", {
      owner: "owner 4&view=other",
      filter: ["available", "goalies/defence"],
      omitted: undefined,
    }),
    "/draft/teams?owner=owner+4%26view%3Dother&filter=available&filter=goalies%2Fdefence",
  );
});

void test("rejects non-internal callback path metadata", () => {
  assert.equal(
    buildInternalCallbackPath("//example.com/draft", { owner: "owner-4" }),
    "/lockerroom",
  );
  assert.equal(
    buildInternalCallbackPath("/draft?owner=owner-4"),
    "/lockerroom",
  );
  assert.equal(buildInternalCallbackPath("/draft/../signin"), "/lockerroom");
});

void test("preserves internal relative callback paths and query state", () => {
  assert.equal(
    resolveSafeCallbackPath(
      "/lockerroom?view=salary&owner=owner-2",
      "https://gshl.test",
    ),
    "/lockerroom?view=salary&owner=owner-2",
  );
});

void test("normalizes Auth.js same-origin absolute callbacks", () => {
  assert.equal(
    resolveSafeCallbackPath(
      "https://gshl.test/draft/teams?owner=owner-4",
      "https://gshl.test",
    ),
    "/draft/teams?owner=owner-4",
  );
});

void test("rejects cross-origin, protocol-relative, and non-HTTP callbacks", () => {
  assert.equal(
    resolveSafeCallbackPath(
      "https://example.com/lockerroom",
      "https://gshl.test",
    ),
    "/lockerroom",
  );
  assert.equal(
    resolveSafeCallbackPath("//example.com/path", "https://gshl.test"),
    "/lockerroom",
  );
  assert.equal(
    resolveSafeCallbackPath("/\\example.com/path", "https://gshl.test"),
    "/lockerroom",
  );
  assert.equal(
    resolveSafeCallbackPath("\\\\example.com/path", "https://gshl.test"),
    "/lockerroom",
  );
  assert.equal(
    resolveSafeCallbackPath("https:\\example.com/path", "https://gshl.test"),
    "/lockerroom",
  );
  assert.equal(
    resolveSafeCallbackPath("javascript:alert(1)", "https://gshl.test"),
    "/lockerroom",
  );
});
