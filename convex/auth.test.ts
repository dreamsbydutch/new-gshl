import assert from "node:assert/strict";
import test from "node:test";
import { requireServerSecret } from "./lib/auth";

void test("server requests require a configured, exact secret on every call", () => {
  const original = process.env.CONVEX_SERVER_SECRET;
  try {
    delete process.env.CONVEX_SERVER_SECRET;
    assert.throws(() => requireServerSecret(""), /Unauthorized server request/);
    assert.throws(
      () => requireServerSecret("test-secret"),
      /Unauthorized server request/,
    );

    process.env.CONVEX_SERVER_SECRET = "test-secret";
    assert.throws(() => requireServerSecret(""), /Unauthorized server request/);
    assert.throws(
      () => requireServerSecret("wrong-secret"),
      /Unauthorized server request/,
    );
    assert.doesNotThrow(() => requireServerSecret("test-secret"));

    process.env.CONVEX_SERVER_SECRET = "rotated-test-secret";
    assert.throws(
      () => requireServerSecret("test-secret"),
      /Unauthorized server request/,
    );
    assert.doesNotThrow(() => requireServerSecret("rotated-test-secret"));
  } finally {
    if (original === undefined) delete process.env.CONVEX_SERVER_SECRET;
    else process.env.CONVEX_SERVER_SECRET = original;
  }
});
