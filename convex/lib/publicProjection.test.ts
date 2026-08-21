import assert from "node:assert/strict";
import test from "node:test";

import {
  pickDefinedFields,
  PLAYER_NHL_DISPLAY_FIELDS,
} from "./publicProjection";

test("keeps only requested defined fields in a public projection", () => {
  assert.deepEqual(
    pickDefinedFields(
      {
        id: "player-1",
        fullName: "Gem Stone",
        optional: undefined,
        privateValue: "not-for-the-browser",
        _creationTime: 123,
      },
      ["id", "fullName", "optional"],
    ),
    { id: "player-1", fullName: "Gem Stone" },
  );
});

test("NHL display rows exclude persisted metadata and non-rendered metrics", () => {
  const fields = new Set<string>(PLAYER_NHL_DISPLAY_FIELDS);
  assert.equal(fields.has("playerId"), true);
  assert.equal(fields.has("GP"), true);
  assert.equal(fields.has("createdAt"), false);
  assert.equal(fields.has("overallRating"), false);
});
