import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ADMIN_VIEW, resolveAdminView } from "./admin-navigation";

void test("admin navigation defaults to contract management", () => {
  assert.equal(DEFAULT_ADMIN_VIEW, "contracts");
  assert.equal(resolveAdminView(undefined), "contracts");
  assert.equal(resolveAdminView("invalid"), "contracts");
});

void test("admin navigation accepts every dedicated admin view", () => {
  for (const view of [
    "draftPicks",
    "contracts",
    "users",
    "jobs",
    "newsroom",
    "images",
    "tv",
  ] as const) {
    assert.equal(resolveAdminView(view), view);
  }
});
