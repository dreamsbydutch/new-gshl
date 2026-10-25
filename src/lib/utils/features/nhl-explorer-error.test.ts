import assert from "node:assert/strict";
import { test } from "node:test";
import {
  claimNhlExplorerChunkReload,
  isNhlExplorerChunkError,
  sanitizeNhlExplorerErrorText,
} from "./nhl-explorer-error";

void test("stale dynamic imports reload only once while ordinary render errors do not", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  assert.equal(
    isNhlExplorerChunkError(
      Object.assign(new Error("Loading chunk 4344 failed."), {
        name: "ChunkLoadError",
      }),
    ),
    true,
  );
  assert.equal(
    isNhlExplorerChunkError(
      new Error("Failed to fetch dynamically imported module"),
    ),
    true,
  );
  assert.equal(
    isNhlExplorerChunkError(new Error("Invalid NHL usage artifact")),
    false,
  );
  assert.equal(claimNhlExplorerChunkReload(storage, 1_000_000), true);
  assert.equal(claimNhlExplorerChunkReload(storage, 1_000_001), false);
  assert.equal(claimNhlExplorerChunkReload(storage, 1_300_001), true);
});
void test("blocked session storage cannot trigger an automatic reload loop", () => {
  assert.equal(
    claimNhlExplorerChunkReload(
      {
        getItem: () => {
          throw Error("blocked");
        },
        setItem: () => undefined,
      },
      1_000_000,
    ),
    false,
  );
});
void test("diagnostics remove query values, credentials and email while retaining chunk locations", () => {
  const value = sanitizeNhlExplorerErrorText(
    "Error at https://gshlapp.vercel.app/_next/static/chunks/a.js:1:45?token=private user@example.com password=private Bearer private",
  );
  assert.ok(value.includes("a.js:1:45"));
  assert.ok(!value.includes("private"));
  assert.ok(!value.includes("user@example.com"));
  assert.ok(!value.includes("?token="));
  assert.equal(sanitizeNhlExplorerErrorText("x".repeat(5000)).length, 1500);
});
