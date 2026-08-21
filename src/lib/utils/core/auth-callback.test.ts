import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInternalCallbackPath,
  resolveSafeCallbackPath,
} from "./auth-callback";

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
