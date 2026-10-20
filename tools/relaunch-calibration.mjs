// Read-only local historical calibration. No network, credentials, or production writes.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import assert from "node:assert/strict";
import {
  categories,
  goalieTotals,
  probabilities,
  random,
  draw,
  ufaScore,
} from "./relaunch-model.mjs";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const sourceFile = ".local-data/draft-slot-research/source.json";
const bytes = fs.readFileSync(sourceFile),
  source = JSON.parse(bytes);
const season = source.seasonRows.find((s) => s.name === "2024-25");
assert.ok(season);
const legacySkaters = source.playerNhlRows.filter(
  (r) => r.seasonId === season.id && r.posGroup !== "G" && Number(r.GP) > 0,
);
const summaryBytes = fs.readFileSync(
  ".local-data/relaunch-calibration/skater-summary-20242025.json",
);
const realtimeBytes = fs.readFileSync(
  ".local-data/relaunch-calibration/skater-realtime-20242025.json",
);
const skaters = JSON.parse(summaryBytes).data,
  realtime = JSON.parse(realtimeBytes).data;
assert.equal(new Set(skaters.map((r) => r.playerId)).size, skaters.length);
assert.equal(new Set(realtime.map((r) => r.playerId)).size, realtime.length);
const appearances = skaters.reduce((s, r) => s + r.gamesPlayed, 0);
assert.equal(
  realtime.reduce((s, r) => s + r.gamesPlayed, 0),
  appearances,
);
const impact = Object.fromEntries(
  categories.map((c) => {
    const field = {
      G: "goals",
      A: "assists",
      P: "points",
      PPP: "ppPoints",
      SOG: "shots",
      HIT: "hits",
      BLK: "blockedShots",
    }[c];
    const rows = c === "HIT" || c === "BLK" ? realtime : skaters;
    assert.ok(rows.every((r) => Number.isFinite(r[field])));
    return [c, rows.reduce((s, r) => s + r[field], 0) / appearances];
  }),
);

const games = JSON.parse(
  fs.readFileSync(".local-data/nhl-rating/games-2024.json"),
).games.sort((a, b) => a.id - b.id);
const goalies = [],
  hashes = [],
  nhlSkaters = [];
for (let offset = 0; offset < games.length; offset += 100) {
  const batch = games.slice(offset, offset + 100);
  const params = new URLSearchParams({
    isAggregate: "false",
    isGame: "true",
    start: "0",
    limit: "-1",
    cayenneExp: `gameId>=${batch[0].id} and gameId<=${batch.at(-1).id}`,
  });
  for (const kind of ["goalie", "skater"]) {
    const url = `https://api.nhle.com/stats/rest/en/${kind}/summary?${params}`;
    const path = `.local-data/nhl-rating/game-cache/${sha(url)}`;
    const meta = JSON.parse(fs.readFileSync(`${path}.json`)),
      stored = fs.readFileSync(`${path}.bin`);
    const raw = meta.encoding === "gzip" ? gunzipSync(stored) : stored;
    assert.equal(sha(raw), meta.sha256);
    hashes.push(meta.sha256);
    const page = JSON.parse(raw);
    assert.equal(page.data.length, page.total);
    assert.ok(
      page.data.every(
        (r) => batch.some((g) => g.id === r.gameId) && r.gamesPlayed === 1,
      ),
    );
    if (kind === "skater") nhlSkaters.push(...page.data);
    else
      goalies.push(
        ...page.data.map((r) => ({
          id: `${r.gameId}:${r.playerId}`,
          gameId: r.gameId,
          W: r.wins,
          GA: r.goalsAgainst,
          SA: r.shotsAgainst,
          SV: r.saves,
          seconds: r.timeOnIce,
        })),
      );
  }
}
assert.equal(new Set(goalies.map((r) => r.id)).size, goalies.length);
assert.equal(new Set(goalies.map((r) => r.gameId)).size, games.length);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
assert.equal(
  new Set(nhlSkaters.map((r) => `${r.gameId}:${r.playerId}`)).size,
  nhlSkaters.length,
);
assert.equal(nhlSkaters.length, appearances);
for (const [c, field] of Object.entries({
  G: "goals",
  A: "assists",
  P: "points",
  SOG: "shots",
})) {
  assert.ok(
    Math.abs(impact[c] - mean(nhlSkaters.map((r) => r[field]))) < 1e-12,
  );
}
impact.PPP = mean(nhlSkaters.map((r) => r.ppPoints));
const avg = Object.fromEntries(
  ["W", "GA", "SA", "SV", "seconds"].map((c) => [
    c,
    mean(goalies.map((r) => r[c])),
  ]),
);
const reference = [avg, avg, avg],
  base = goalieTotals(reference);
impact.W = avg.W;
for (const c of ["GAA", "SVP"])
  impact[c] = mean(
    goalies.map((r) => Math.abs(goalieTotals([...reference, r])[c] - base[c])),
  );

const weak = 0.75 * 0.6 + 0.25 * 0.7,
  strong = 0.75 * 0.1 + 0.25 * 0.2;
const common = {
  min: 4400000,
  max: 5950000,
  p: 0.9,
  performance: 0.5,
  ladder: 0.5,
  draft: 0.5,
};
const ufa = (quality, opportunity, salary, years) =>
  ufaScore({ ...common, quality, opportunity, salary, years });
const ps = probabilities([0.7, 0]),
  rng = random();
let wins = 0;
for (let i = 0; i < 200000; i++) if (draw(ps, rng()) === 0) wins++;
console.log(
  JSON.stringify(
    {
      historicalCalibration: {
        season: season.name,
        sourceSha256: sha(bytes),
        skaters: skaters.length,
        appearances,
        nhlGames: games.length,
        goalieAppearances: goalies.length,
        cachedPagesSha256: sha(hashes.join("\n")),
        summarySha256: sha(summaryBytes),
        realtimeSha256: sha(realtimeBytes),
        rejectedLegacyAppearances: legacySkaters.reduce(
          (s, r) => s + Number(r.GP),
          0,
        ),
        typicalImpact: impact,
        goalieReference: base,
      },
      examples: {
        claimWeakVsStrong: probabilities([weak, strong]),
        ufaEqualMoneyStrongVsWeak: probabilities([
          ufa(0.8, 0.1, 4400000, 1),
          ufa(0.3, 0.6, 4400000, 1),
        ]),
        ufaWeakMaxVsStrongMin: probabilities([
          ufa(0.3, 0.6, 5950000, 3),
          ufa(0.8, 0.1, 4400000, 1),
        ]),
        maximumVsMinimumOtherwiseEqual: ps,
        seededObserved: wins / 200000,
        fourteenBiddersOneMax: probabilities([1, ...Array(13).fill(0)])[0],
        draftFullClockDays112: Math.ceil((112 * 4) / 12),
        draftFullClockDays322: Math.ceil((322 * 4) / 12),
      },
    },
    null,
    2,
  ),
);
