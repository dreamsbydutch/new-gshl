// Reads cached snapshots only; no network access or data writes.
import fs from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import {
  expectedSigningRating,
  openingSigningSalary,
} from "../src/lib/utils/features/signing-value.ts";
const performanceSource = fs.readFileSync(
  process.argv[2] ?? ".local-data/draft-slot-research/source.json",
);
const contractSource = fs.readFileSync(
  process.argv[3] ?? ".local-data/draft-signings-source.json",
);
const d = JSON.parse(performanceSource);
const s = JSON.parse(contractSource);
const contracts = s.contracts.map((row) => ({
  playerId: row.playerId,
  ownerId: row.ownerId,
  start: row.startDate,
  end: row.expiryDate,
  signed: row.signingDate,
  salary: row.contractSalary == null ? null : Number(row.contractSalary),
}));
const rows = [],
  coverage = [];
for (const season of d.seasonRows.filter(
  (x) => x.endDate < d.fetchedAt.slice(0, 10),
)) {
  let unmatched = 0,
    ambiguous = 0,
    missing = 0;
  const picks = d.draftPickRows.filter(
    (x) => x.seasonId === season.id && x.isSigning && x.playerId,
  );
  for (const p of picks) {
    const team = s.teams.find((x) => x.id === p.gshlTeamId),
      owner = s.franchises.find((x) => x.id === team?.franchiseId)?.ownerId;
    const cs = s.contracts
      .filter(
        (x) =>
          x.playerId === p.playerId &&
          x.ownerId === owner &&
          x.startDate <= season.startDate &&
          x.expiryDate >= season.startDate &&
          x.signingDate <= season.startDate,
      )
      .sort(
        (a, b) =>
          b.startDate.localeCompare(a.startDate) ||
          b.signingDate.localeCompare(a.signingDate),
      );
    const latest = cs[0];
    const salaries = [
      ...new Set(
        cs
          .filter(
            (x) =>
              x.startDate === latest?.startDate &&
              x.signingDate === latest?.signingDate,
          )
          .map((x) => Number(x.contractSalary))
          .filter((x) => Number.isFinite(x) && x > 0),
      ),
    ];
    const resolvedSalary = openingSigningSalary(
      contracts,
      p.playerId,
      owner,
      season.startDate,
    );
    assert.equal(
      resolvedSalary,
      salaries.length === 1 ? salaries[0] : null,
      "Research salary matching must agree with the display resolver",
    );
    if (salaries.length !== 1) {
      if (salaries.length) ambiguous++;
      else unmatched++;
      continue;
    }
    const t = d.playerTotalRows.find(
      (x) =>
        x.seasonId === season.id &&
        x.playerId === p.playerId &&
        x.seasonType === "RS",
    );
    if (
      t?.Rating == null ||
      String(t.Rating).trim() === "" ||
      !Number.isFinite(Number(t.Rating))
    ) {
      missing++;
      continue;
    }
    rows.push({
      season: season.name,
      salary: resolvedSalary,
      rating: Number(t.Rating),
      position: t.posGroup,
      playerId: p.playerId,
    });
  }
  if (picks.length)
    coverage.push({
      season: season.name,
      picks: picks.length,
      unmatched,
      ambiguous,
      missing,
      rated: rows.filter((x) => x.season === season.name).length,
    });
}
const feat = (r, f) =>
  f === "log"
    ? Math.log(r.salary / 1e6)
    : f === "sqrt"
      ? Math.sqrt(r.salary / 1e6)
      : f === "constant"
        ? 0
        : r.salary / 1e6;
function fit(rs, f) {
  const xs = rs.map((r) => feat(r, f)),
    mx = xs.reduce((a, b) => a + b, 0) / rs.length,
    my = rs.reduce((a, r) => a + r.rating, 0) / rs.length;
  const variance = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const slope = variance
    ? Math.max(
        0,
        rs.reduce((a, r, i) => a + (xs[i] - mx) * (r.rating - my), 0) /
          variance,
      )
    : 0;
  return { intercept: my - slope * mx, slope };
}
const pred = (r, f, c) => c.intercept + c.slope * feat(r, f);
function errors(ps) {
  return {
    n: ps.length,
    rmse: Math.sqrt(ps.reduce((a, p) => a + (p.p - p.y) ** 2, 0) / ps.length),
    mae: ps.reduce((a, p) => a + Math.abs(p.p - p.y), 0) / ps.length,
  };
}
const years = [...new Set(rows.map((r) => r.season))];
const adjusted = (train, r, k) => {
  const c = fit(train, "sqrt");
  const group = train.filter((x) => x.position === r.position);
  const offset =
    group.reduce((a, x) => a + x.rating - pred(x, "sqrt", c), 0) /
    (group.length + k);
  return pred(r, "sqrt", c) + offset;
};
const positionModels = [0, 10, 25, 50, 100, 100000000].map((k) => ({
  k,
  season: errors(
    years.flatMap((y) =>
      rows
        .filter((r) => r.season === y)
        .map((r) => ({
          y: r.rating,
          p: adjusted(
            rows.filter((r) => r.season !== y),
            r,
            k,
          ),
        })),
    ),
  ),
  temporal: errors(
    rows
      .filter((r) => r.season >= "2024")
      .map((r) => ({
        y: r.rating,
        p: adjusted(
          rows.filter((r) => r.season < "2024"),
          r,
          k,
        ),
      })),
  ),
}));
const playerHoldout = ["linear", "sqrt", "log"].map((f) => ({
  f,
  errors: errors(
    [...new Set(rows.map((r) => r.playerId))].flatMap((id) => {
      const c = fit(
        rows.filter((r) => r.playerId !== id),
        f,
      );
      return rows
        .filter((r) => r.playerId === id)
        .map((r) => ({ y: r.rating, p: pred(r, f, c) }));
    }),
  ),
}));
const models = ["constant", "linear", "sqrt", "log"].map((f) => {
  const pairs = years.flatMap((y) => {
    const c = fit(
      rows.filter((r) => r.season !== y),
      f,
    );
    return rows
      .filter((r) => r.season === y)
      .map((r) => ({ p: pred(r, f, c), y: r.rating }));
  });
  return {
    family: f,
    coefficients: fit(rows, f),
    heldOutSeason: errors(pairs),
    temporal: errors(
      rows
        .filter((r) => r.season >= "2024")
        .map((r) => ({
          p: pred(
            r,
            f,
            fit(
              rows.filter((r) => r.season < "2024"),
              f,
            ),
          ),
          y: r.rating,
        })),
    ),
  };
});
const selectedCurve = models.find(
  (model) => model.family === "sqrt",
).coefficients;
for (const row of rows) {
  const expected = expectedSigningRating(row.salary);
  assert.ok(
    expected !== null &&
      Math.abs(expected - pred(row, "sqrt", selectedCurve)) < 1e-10,
    "Refitted calibration must agree with the display curve; review changed sources before updating coefficients",
  );
}
const out = {
  coverage,
  n: rows.length,
  salaryMin: Math.min(...rows.map((r) => r.salary)),
  salaryMax: Math.max(...rows.map((r) => r.salary)),
  models,
  positions: [...new Set(rows.map((r) => r.position))].map((position) => ({
    position,
    n: rows.filter((r) => r.position === position).length,
    mean:
      rows
        .filter((r) => r.position === position)
        .reduce((a, r) => a + r.rating, 0) /
      rows.filter((r) => r.position === position).length,
  })),
  rows,
};
console.log(
  JSON.stringify(
    {
      ...out,
      rows: undefined,
      positionModels,
      playerHoldout,
      uniquePlayers: new Set(rows.map((r) => r.playerId)).size,
      sourceSha256: {
        performance: createHash("sha256")
          .update(performanceSource)
          .digest("hex"),
        contracts: createHash("sha256").update(contractSource).digest("hex"),
      },
    },
    null,
    2,
  ),
);
