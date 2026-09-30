import assert from "node:assert/strict";
import { test } from "node:test";
import type { Id } from "./_generated/dataModel";
import { nhlProfileContract } from "./lib/nhlProfileContract";
import { mergeNhlContractFields } from "./lib/nhlContractMerge";

const profile = {
  _id: "player" as Id<"players">,
  nhlStartYear: "2026",
  nhlExpiryYear: "2026",
  nhlContractLength: "1",
  nhlSigningDate: "2026-07-01",
  nhlCapHit: 900_000,
};
void test("requires full, consistent, season-covering terms and an actual cap hit", () => {
  assert.equal(nhlProfileContract(profile, 2026)?.capHit, 900_000);
  assert.equal(
    nhlProfileContract(
      { ...profile, nhlSigningDate: Date.UTC(2026, 6, 1) },
      2026,
    )?.signingDate,
    Date.UTC(2026, 6, 1),
  );
  for (const patch of [
    { nhlCapHit: null },
    { nhlSigningDate: null },
    { nhlContractLength: "2" },
    { nhlStartYear: null },
  ])
    assert.equal(nhlProfileContract({ ...profile, ...patch }, 2026), null);
  assert.equal(nhlProfileContract(profile, 2027), null);
});
void test("live directory observations outrank recovered profile data, which outranks imported history", () => {
  const live = { source: "puckpedia", capHit: 1_000_000 };
  const recovered = { source: "player-profile", capHit: 900_000 };
  assert.equal(mergeNhlContractFields(live, recovered).capHit, 1_000_000);
  assert.equal(mergeNhlContractFields(recovered, live).source, "puckpedia");
  assert.equal(
    mergeNhlContractFields(recovered, {
      source: "historical-json",
      capHit: 800_000,
    }).capHit,
    900_000,
  );
});
