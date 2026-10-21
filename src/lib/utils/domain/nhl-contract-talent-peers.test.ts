import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  NhlTalentAnnualSeason,
  NhlTalentForecastProfile,
} from "../../types/nhl-contract-talent-forecast";
import {
  createNhlTalentPeerFitter,
  validateNhlTalentPeerAging,
} from "./nhl-contract-talent-peers";

function source(): NhlTalentAnnualSeason[] {
  return Array.from({ length: 13 }, (_, i) => ({
    year: 2014 + i,
    seasonComplete: true,
    officialCohortComplete: true,
    teamGames: 82,
    modelVersion: "nhl-hockey-overall-reviewed-v1",
    players: Array.from({ length: 40 }, (_, j) => {
      const age = 18 + i,
        strong = j < 20;
      const gar = strong
        ? age <= 25
          ? 10 + 3 * (age - 18)
          : 31 - 2 * (age - 25)
        : age <= 25
          ? 1.7 + 0.1 * (age - 18)
          : 2.4 - 0.1 * (age - 25);
      return {
        nhlPlayerId: j + 1,
        position: "F" as const,
        age,
        games: 75,
        minutes: 1200,
        goalsAboveReplacement: gar,
      };
    }).concat(
      i < 10
        ? []
        : [1001, 1002].map((nhlPlayerId) => ({
            nhlPlayerId,
            position: "F" as const,
            age: 19 + i - 10,
            games: 75,
            minutes: 1200,
            goalsAboveReplacement:
              nhlPlayerId === 1001 ? 13 + 3 * (i - 10) : 1.8 + 0.1 * (i - 10),
          })),
    ),
  }));
}
function profiles(
  seasons: readonly NhlTalentAnnualSeason[],
): NhlTalentForecastProfile[] {
  return seasons.flatMap((s) =>
    s.players.map((p) => {
      const prev = seasons.find((t) => t.year === s.year - 1),
        q = prev?.players.find((v) => v.nhlPlayerId === p.nhlPlayerId);
      const gar = p.goalsAboveReplacement,
        old = prev ? (q?.goalsAboveReplacement ?? (q ? null : 0)) : null;
      const count = seasons.filter(
        (t) =>
          t.year <= s.year &&
          t.year > s.year - 3 &&
          t.players.some(
            (v) =>
              v.nhlPlayerId === p.nhlPlayerId &&
              v.goalsAboveReplacement !== null,
          ),
      ).length;
      return {
        peerAging: null,
        nhlPlayerId: p.nhlPlayerId,
        position: p.position,
        originYear: s.year,
        knownGarSeasons: count,
        latestAppearanceYear: s.year,
        latestObserved: gar ?? 0,
        features: [
          gar ?? 0,
          old ?? 0,
          p.minutes,
          q?.minutes ?? 0,
          p.games / 82,
          (q?.games ?? 0) / 82,
          p.age ?? 0,
          p.age === null ? 0 : p.age ** 2,
          p.age === null ? 0 : 1,
          gar === null ? 0 : 1,
          old === null ? 0 : 1,
          1,
          q ? 1 : 0,
          0,
          count,
        ],
      };
    }),
  );
}
void test("different performance trajectories at the same age produce different peer development curves", () => {
  const seasons = source(),
    history = profiles(seasons),
    fit = createNhlTalentPeerFitter(seasons, history, "F");
  const strong = fit(
    history.find((p) => p.nhlPlayerId === 1001 && p.originYear === 2026)!,
  )!;
  const weak = fit(
    history.find((p) => p.nhlPlayerId === 1002 && p.originYear === 2026)!,
  )!;
  assert.ok(strong && weak);
  assert.ok(strong.curve.developmentRate > weak.curve.developmentRate);
  assert.notDeepEqual(
    strong.nearest.map((p) => p.nhlPlayerId),
    weak.nearest.map((p) => p.nhlPlayerId),
  );
  assert.ok(
    strong.nearest.every((p) => p.nhlPlayerId !== 1001 && p.originYear < 2026),
  );
  assert.equal(
    new Set(strong.nearest.map((p) => p.nhlPlayerId)).size,
    strong.nearest.length,
  );
  assert.doesNotThrow(() => validateNhlTalentPeerAging(strong));
});
void test("missing subsequent performance does not replace a selected peer", () => {
  const seasons = source(),
    history = profiles(seasons),
    query = history.find(
      (p) => p.nhlPlayerId === 1001 && p.originYear === 2026,
    )!;
  // Freeze the origin episodes, then change only their later outcomes.
  const before = createNhlTalentPeerFitter(
    seasons,
    history.filter((p) => p.originYear === 2017),
    "F",
  )(query)!;
  const missing = before.nearest[0]!;
  for (const s of seasons.filter((s) => s.year > missing.originYear))
    s.players = s.players.map((p) =>
      p.nhlPlayerId === missing.nhlPlayerId
        ? { ...p, goalsAboveReplacement: null }
        : p,
    );
  const after = createNhlTalentPeerFitter(
    seasons,
    profiles(seasons).filter((p) => p.originYear === 2017),
    "F",
  )(query)!;
  assert.deepEqual(after.nearest, before.nearest);
  assert.equal(after.selectedPeers, before.selectedPeers);
  assert.equal(after.contributingPeers, before.contributingPeers - 1);
});
void test("sparse comparables fall back and peer self-matches are rejected", () => {
  const seasons = source().map((s) => ({
    ...s,
    players: s.players.filter(
      (p) => p.nhlPlayerId <= 3 || p.nhlPlayerId === 1001,
    ),
  }));
  const history = profiles(seasons),
    query = history.find(
      (p) => p.nhlPlayerId === 1001 && p.originYear === 2026,
    )!;
  assert.equal(createNhlTalentPeerFitter(seasons, history, "F")(query), null);
  const complete = source(),
    all = profiles(complete),
    model = createNhlTalentPeerFitter(
      complete,
      all,
      "F",
    )(all.find((p) => p.nhlPlayerId === 1001 && p.originYear === 2026)!)!;
  model.nearest[0]!.nhlPlayerId = model.playerId;
  assert.throws(
    () => validateNhlTalentPeerAging(model),
    /Invalid NHL talent peer/,
  );
});
