import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseNhlContractHistory,
  puckPediaContractCandidates,
  reconcileNhlContracts,
  groupNhlContracts,
  parseNhlContractPlayerMappings,
} from "./nhl-contracts";
import { mapPuckPediaPlayer } from "./player-directory";
import {
  changedNhlContractFields,
  mergeNhlContractFields,
} from "../../../../convex/lib/nhlContractMerge";

const historical = {
  Name: "Test Player",
  Birthdate: "1990-01-01",
  Season: "2025",
  "Signing Date": "2024-07-01",
  "Start Year": "2024-25",
  "Expiry Year": "2025-26",
  Length: "2",
  "Cap Hit": "$2,500,000",
  Status: "YR 1 OF 2",
  Clauses: "",
  ContractId: "2025-Test Player-F",
  "Signing Agent": "An Agent",
};
const storedPlayer = {
  id: "player1",
  fullName: "Test Player",
  birthday: "1990-01-01",
  nhlApiId: "123",
};

test("reviewed mappings resolve missing bios and preserve evidence without silently accepting birthdate conflicts", () => {
  const candidates = parseNhlContractHistory([historical], "history.json").rows;
  const mapping = {
    sourceName: "Test Player",
    sourceBirthDate: "1990-01-01",
    playerId: "player1",
    reason: "Verified against NHL ID",
    sourceRef: "https://example.test/player/123",
  };
  const mappings = parseNhlContractPlayerMappings([mapping]);
  const missingBio = { ...storedPlayer, birthday: null };
  assert.equal(reconcileNhlContracts(candidates, [missingBio]).rows.length, 0);
  const matched = reconcileNhlContracts(candidates, [missingBio], mappings);
  assert.equal(matched.mappedRows, 1);
  assert.equal(matched.rows[0]?.identityMatchSource, mapping.sourceRef);
  assert.equal(matched.rows[0]?.historicalValues?.Birthdate, "1990-01-01");
  const conflictingBio = { ...storedPlayer, birthday: "1991-01-01" };
  assert.equal(
    reconcileNhlContracts(candidates, [conflictingBio], mappings).rows.length,
    0,
  );
  assert.equal(
    reconcileNhlContracts(
      candidates,
      [conflictingBio],
      [{ ...mapping, allowBirthdateConflict: true }],
    ).rows.length,
    1,
  );
  assert.equal(reconcileNhlContracts(candidates, [], mappings).rows.length, 0);
  assert.throws(
    () => parseNhlContractPlayerMappings([mapping, mapping]),
    /Duplicate/,
  );
  assert.throws(
    () => parseNhlContractPlayerMappings([{ ...mapping, reason: "" }]),
    /reason/,
  );
});

test("import uses ending-year seasons, skips placeholders, and deduplicates without treating rank as contract data", () => {
  const result = parseNhlContractHistory(
    [historical, { ...historical, Rk: "2" }, { Season: "2036", Name: " " }],
    "history.json",
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.blankRows, 1);
  assert.equal(result.duplicateRows, 1);
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0]?.seasonStartYear, 2024);
  assert.equal(result.rows[0]?.capHit, 2_500_000);
  assert.equal(result.rows[0]?.signingDate, Date.UTC(2024, 6, 1));
  assert.equal(result.rows[0]?.cashSalary, undefined);
});

test("season-specific clauses and cap hits remain linked to one contract", () => {
  const audit = parseNhlContractHistory(
    [
      historical,
      {
        ...historical,
        Season: "2026",
        Status: "YR 2 OF 2",
        "Cap Hit": "$2,000,000",
        Clauses: "NMC",
      },
    ],
    "history.json",
  );
  const result = reconcileNhlContracts(audit.rows, [storedPlayer]);
  assert.equal(groupNhlContracts(result.rows).length, 1);
  assert.deepEqual(
    result.rows.map((r) => [r.seasonStartYear, r.capHit, r.clauses]),
    [
      [2024, 2_500_000, ""],
      [2025, 2_000_000, "NMC"],
    ],
  );
});

test("conflicting duplicate money blocks the import", () => {
  const result = parseNhlContractHistory(
    [historical, { ...historical, "Cap Hit": "$1" }],
    "history.json",
  );
  assert.match(result.errors[0]!, /conflicting duplicate/);
});

test("invalid dates and missing player identity are errors; term discrepancies are retained as warnings", () => {
  assert.equal(
    parseNhlContractHistory(
      [{ ...historical, "Signing Date": "2024-02-30" }],
      "history.json",
    ).errors.length,
    1,
  );
  assert.equal(
    parseNhlContractHistory([{ ...historical, Name: "" }], "history.json")
      .errors.length,
    1,
  );
  const result = parseNhlContractHistory(
    [{ ...historical, Status: "YR 2 OF 2" }],
    "history.json",
  );
  assert.equal(result.warnings.length, 1);
  assert.equal(result.rows[0]?.historicalValues?.Status, "YR 2 OF 2");
});

test("player resolution requires matching birthdate and rejects ambiguous identities", () => {
  const rows = parseNhlContractHistory([historical], "history.json").rows;
  assert.equal(reconcileNhlContracts(rows, [storedPlayer]).rows.length, 1);
  assert.equal(
    reconcileNhlContracts(rows, [{ ...storedPlayer, birthday: "1991-01-01" }])
      .unresolved.length,
    1,
  );
  assert.equal(
    reconcileNhlContracts(rows, [
      storedPlayer,
      { ...storedPlayer, id: "player2" },
    ]).unresolved.length,
    1,
  );
  assert.equal(
    reconcileNhlContracts(rows, [
      { ...storedPlayer, birthday: Date.UTC(1990, 0, 1) },
    ]).rows.length,
    1,
  );
});

test("new extension and current contract keep separate identities", () => {
  const audit = parseNhlContractHistory(
    [
      historical,
      {
        ...historical,
        Season: "2027",
        "Start Year": "2026-27",
        "Expiry Year": "2027-28",
        "Signing Date": "2025-07-01",
        ContractId: "2027-Test Player-F",
      },
    ],
    "history.json",
  );
  assert.equal(
    groupNhlContracts(reconcileNhlContracts(audit.rows, [storedPlayer]).rows)
      .length,
    2,
  );
});

test("PuckPedia preserves cash separately and does not project a current contract into an uncovered future season", () => {
  const player = mapPuckPediaPlayer({
    p_fn: "Test",
    p_ln: "Player",
    p_id: "1",
    nhl_id: "123",
    pos: "c",
    birthdate: "1990-01-01",
    start: "2024-25",
    exp: "2025-26",
    len: "2",
    sign_date: "2024-07-01",
    sal_t: 3_000_000,
    cap_hit: 2_500_000,
  });
  assert.ok(player);
  const audit = puckPediaContractCandidates([player], 2024, "token");
  assert.equal(audit.rows[0]?.cashSalary, 3_000_000);
  assert.equal(audit.rows[0]?.capHit, 2_500_000);
  const future = puckPediaContractCandidates([player], 2026, "future-token");
  assert.equal(future.rows.length, 0);
  assert.equal(future.warnings.length, 1);
  assert.equal(
    puckPediaContractCandidates([{ ...player, signingDate: "" }], 2024, "token")
      .warnings.length,
    1,
  );
});

test("a stable NHL ID can resolve name changes but cannot override contradictory birthdates", () => {
  const candidate = {
    ...parseNhlContractHistory([historical], "history.json").rows[0]!,
    nhlApiId: "123",
    fullName: "Different Name",
  };
  assert.equal(
    reconcileNhlContracts([candidate], [storedPlayer]).rows.length,
    1,
  );
  assert.equal(
    reconcileNhlContracts(
      [{ ...candidate, birthDate: "1991-01-01" }],
      [storedPlayer],
    ).unresolved.length,
    1,
  );
});

test("merge preserves historical metadata, excludes database system fields, and protects live values on re-import", () => {
  const existing = {
    _id: "db-id",
    source: "puckpedia",
    capHit: 3_000_000,
    signingAgent: "Known Agent",
    historicalValues: { original: "value" },
  };
  const merged = mergeNhlContractFields(existing, {
    source: "historical-json",
    capHit: 2_000_000,
    signingAgent: undefined,
    historicalValues: { original: "value" },
  });
  assert.equal(merged.capHit, 3_000_000);
  assert.equal(merged.signingAgent, "Known Agent");
  assert.equal("_id" in merged, false);
  assert.equal(changedNhlContractFields(existing, merged), false);
  assert.equal(
    mergeNhlContractFields(existing, { source: "puckpedia", capHit: 4_000_000 })
      .capHit,
    4_000_000,
  );
});

test("database object-key ordering does not turn a repeat import into an update", () => {
  assert.equal(
    changedNhlContractFields(
      { historicalValues: { Season: "2025", Name: "Test Player" } },
      { historicalValues: { Name: "Test Player", Season: "2025" } },
    ),
    false,
  );
});
