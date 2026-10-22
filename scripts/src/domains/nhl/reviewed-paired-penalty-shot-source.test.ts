import test from "node:test";
import assert from "node:assert/strict";
import { load } from "cheerio";
import { verifyPairedPsSource } from "./reviewed-paired-penalty-shot-source";
import { verifyGs0868Supplement } from "./reviewed-gs-penalty-source";
import { verify1114ReportOnlyPsAward } from "./reviewed-report-only-penalty-shot-award";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import {
  bridgeHistoricalShotSource,
  type HistoricalRawShot,
  type HistoricalShotSupplementalSources,
} from "./historical-shot-source-bridge";
import {
  extractShotTrainingRows,
  penaltyShotEventIds,
} from "./game-value-input";
import type { PairedPsSourceInput } from "./reviewed-paired-penalty-shot-source";
const fixture = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL(
        "./fixtures/reviewed-2008-supplemental-sources.json.gz",
        import.meta.url,
      ),
    ),
  ).toString(),
) as {
  paired: PairedPsSourceInput[];
  gs: Parameters<typeof verifyGs0868Supplement>[0];
  award: Parameters<typeof verify1114ReportOnlyPsAward>[0];
  archive: { url: string; sha256: string };
  providerRowsByGame: Record<string, HistoricalRawShot[]>;
};
const inputs = fixture.paired,
  gs = fixture.gs,
  award = fixture.award;
const mutateJson = (text: string, fn: (j: any) => void) => {
  const j = JSON.parse(text);
  fn(j);
  return JSON.stringify(j);
};
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const integrated = (
  input: { rawPbpText: string; primaryHtml: string },
  sources: HistoricalShotSupplementalSources,
) => {
  const raw = JSON.parse(input.rawPbpText),
    provenance = {
      providerUrl: fixture.archive.url,
      providerSha256: fixture.archive.sha256,
      officialPlayReportUrl: `https://www.nhl.com/scores/htmlreports/20082009/PL${String(raw.id % 1e6).padStart(6, "0")}.HTM`,
      officialPlayReportSha256: sha(input.primaryHtml),
      officialPbpSha256: sha(input.rawPbpText),
    };
  return {
    raw,
    provenance,
    result: bridgeHistoricalShotSource(
      raw,
      fixture.providerRowsByGame[String(raw.id)]!,
      input.primaryHtml,
      provenance,
      sources,
    ),
  };
};
test("full-source bridge integration preserves native facts and counts exactly one verified PS", () => {
  for (const input of inputs) {
    const before = JSON.stringify(input),
      { raw, result } = integrated(input, { pairedPenaltyShot: input });
    assert.equal(JSON.stringify(input), before);
    assert.equal(penaltyShotEventIds(result.pbp).size, 1);
    assert.equal(
      result.pbp.plays.filter((p) => p.details?.nhlReportPenaltyShot === true)
        .length,
      1,
    );
    assert(result.audit.pairedPenaltyShotSource);
    for (const original of raw.plays) {
      const next = result.pbp.plays.find((p) => p.eventId === original.eventId);
      assert(next);
      for (const [k, v] of Object.entries(original)) {
        if (k === "sortOrder") continue;
        if (k === "details")
          for (const [field, value] of Object.entries(v as object))
            assert.deepEqual(next.details?.[field], value);
        else assert.deepEqual(next[k], v);
      }
    }
    const ps = result.pbp.plays.find(
      (p) => p.details?.nhlReportPenaltyShot === true,
    )!;
    assert.equal(
      ps.details?.xCoord,
      raw.plays.find((p: any) => p.eventId === ps.eventId).details?.xCoord,
    );
    if (raw.id === 2008021166) {
      assert.equal(
        result.pbp.plays.find((p) => p.eventId === 11099957)?.details
          ?.nhlReportUnclassifiedPenaltyShotContext,
        true,
      );
      assert(
        !extractShotTrainingRows(result.pbp).some(
          (p) => p.eventId === 11099957,
        ),
      );
    }
  }
});
test("GS bridge adds only independently supplied report identity; native penalty details stay exact", () => {
  const { raw, result } = integrated(gs, { supplementalPenalty: gs });
  assert(result.audit.supplementalPenaltySource);
  for (const id of [11750000, 11750001, 11750002])
    assert.deepEqual(
      result.pbp.plays.find((p) => p.eventId === id)?.details,
      raw.plays.find((p: any) => p.eventId === id).details,
    );
});
test("report-only award remains auditable metadata without inserting a native or priced penalty", () => {
  const { raw, result } = integrated(award, {
    reportOnlyPenaltyShotAward: award,
  });
  assert.equal(
    result.audit.reportOnlyPenaltyShotAward?.reportOnlyAward.ordinal,
    170,
  );
  assert.equal(
    result.audit.reportOnlyPenaltyShotAward?.reportOnlyAward.nativeEventId,
    null,
  );
  assert.equal(
    result.pbp.plays.filter((p) => p.typeDescKey === "penalty").length,
    raw.plays.filter((p: any) => p.typeDescKey === "penalty").length,
  );
  assert.equal(penaltyShotEventIds(result.pbp).size, 1);
  for (const id of [11752681, 11752682])
    assert.deepEqual(
      result.pbp.plays.find((p) => p.eventId === id)?.details,
      raw.plays.find((p: any) => p.eventId === id).details,
    );
});
test("supplemental sources cannot be transplanted onto another bridge body or provenance", () => {
  const input = inputs[1]!,
    { raw, provenance } = integrated(input, { pairedPenaltyShot: input }),
    rows = fixture.providerRowsByGame[String(raw.id)]!;
  for (const bad of [
    { ...input, rawPbpText: "\n" + input.rawPbpText },
    { ...input, primaryHtml: input.primaryHtml + "\n" },
  ])
    assert.throws(
      () =>
        bridgeHistoricalShotSource(raw, rows, input.primaryHtml, provenance, {
          pairedPenaltyShot: bad,
        }),
      /bytes differ/,
    );
  assert.throws(
    () =>
      bridgeHistoricalShotSource(
        { ...raw, gameDate: "2000-01-01" },
        rows,
        input.primaryHtml,
        provenance,
        { pairedPenaltyShot: input },
      ),
    /bytes differ/,
  );
  assert.throws(
    () =>
      bridgeHistoricalShotSource(
        raw,
        rows,
        input.primaryHtml,
        { ...provenance, officialPbpSha256: "0".repeat(64) },
        { pairedPenaltyShot: input },
      ),
    /bytes differ/,
  );
});
test("actual three source candidates preserve unique versus unresolved identity and unknown ordinary context", () => {
  const before = JSON.stringify(inputs),
    proofs = inputs.map(verifyPairedPsSource);
  assert.equal(proofs[0].assignments.length, 0);
  assert.equal(proofs[0].unresolvedBijections.length, 2);
  assert.equal(proofs[1].assignments[1].eventId, 11085885);
  assert.equal(proofs[2].assignments[1].eventId, 11099958);
  assert.equal(proofs[2].assignments[0].unclassified, true);
  assert.deepEqual(
    proofs.map((p) => p.nativeOnGoal),
    [74, 67, 65],
  );
  assert.equal(JSON.stringify(inputs), before);
});
const changes: Array<[string, (i: any) => void]> = [
  [
    "wrong game",
    (i) =>
      (i.rawPbpText = mutateJson(i.rawPbpText, (j) => (j.id = 2008020999))),
  ],
  [
    "wrong date",
    (i) =>
      (i.rawPbpText = mutateJson(
        i.rawPbpText,
        (j) => (j.gameDate = "2009-03-02"),
      )),
  ],
  [
    "wrong box",
    (i) =>
      (i.freshBoxText = mutateJson(i.freshBoxText, (j) => (j.id = 2008020999))),
  ],
  ["wrong ledger", (i) => (i.totals[0].penaltyShotAttempts = 2)],
  [
    "extra native member",
    (i) =>
      (i.rawPbpText = mutateJson(i.rawPbpText, (j) =>
        j.plays.push({
          ...structuredClone(j.plays.find((p: any) => p.eventId === 11085884)),
          eventId: 999999999,
        }),
      )),
  ],
  [
    "native goalie mismatch",
    (i) =>
      (i.rawPbpText = mutateJson(
        i.rawPbpText,
        (j) =>
          (j.plays.find(
            (p: any) => p.eventId === 11085885,
          ).details.goalieInNetId = 123),
      )),
  ],
  [
    "native shot type mismatch",
    (i) =>
      (i.rawPbpText = mutateJson(
        i.rawPbpText,
        (j) =>
          (j.plays.find((p: any) => p.eventId === 11085885).details.shotType =
            "wrist"),
      )),
  ],
  [
    "changed primary type",
    (i) =>
      (i.primaryHtml = i.primaryHtml.replace(
        "Penalty Shot, Snap",
        "Penalty Shot, Wrist",
      )),
  ],
  [
    "wrong printed goalie",
    (i) => {
      const p = load(i.primaryHtml);
      const tr = p("tr")
        .toArray()
        .find(
          (tr) =>
            p(tr).children("td").length === 8 &&
            p(tr).children("td").first().text().trim() === "28",
        );
      p(tr!).children("td").eq(7).text("60 R");
      i.primaryHtml = p.html();
    },
  ],
  [
    "extra primary member",
    (i) => {
      const p = load(i.primaryHtml);
      const tr = p("tr")
        .toArray()
        .find(
          (tr) =>
            p(tr).children("td").length === 8 &&
            p(tr).children("td").first().text().trim() === "28",
        );
      const clone = p(tr!).clone();
      clone.children("td").first().text("999");
      p(tr!).after(clone);
      i.primaryHtml = p.html();
    },
  ],
  [
    "fresh skater count conflict",
    (i) =>
      (i.freshBoxText = mutateJson(
        i.freshBoxText,
        (j) =>
          j.playerByGameStats.awayTeam.forwards.find(
            (p: any) => p.playerId === 8471266,
          ).sog++,
      )),
  ],
  [
    "fresh goalie count conflict",
    (i) =>
      (i.freshBoxText = mutateJson(
        i.freshBoxText,
        (j) =>
          j.playerByGameStats.homeTeam.goalies.find(
            (p: any) => p.playerId === 8460535,
          ).shotsAgainst++,
      )),
  ],
  [
    "removed zero-shot official appearance",
    (i) =>
      (i.freshBoxText = mutateJson(i.freshBoxText, (j) => {
        const xs = j.playerByGameStats.homeTeam.forwards;
        const at = xs.findIndex((p: any) => p.sog === 0 && p.goals === 0);
        assert(at >= 0);
        xs.splice(at, 1);
      })),
  ],
  [
    "canonical appearance TOI changed",
    (i) =>
      (i.officialAppearanceBoxText = mutateJson(
        i.officialAppearanceBoxText,
        (j) => (j.playerByGameStats.homeTeam.forwards[0].toi = "99:99"),
      )),
  ],
  [
    "same-count opposing owner swap",
    (i) =>
      (i.rawPbpText = mutateJson(i.rawPbpText, (j) => {
        const a = j.plays.find(
            (p: any) =>
              p.typeDescKey === "shot-on-goal" &&
              p.details.eventOwnerTeamId === j.homeTeam.id &&
              ![11085884, 11085885].includes(p.eventId),
          ),
          b = j.plays.find(
            (p: any) =>
              p.typeDescKey === "shot-on-goal" &&
              p.details.eventOwnerTeamId === j.awayTeam.id &&
              ![11085884, 11085885].includes(p.eventId),
          );
        [a.details.eventOwnerTeamId, b.details.eventOwnerTeamId] = [
          b.details.eventOwnerTeamId,
          a.details.eventOwnerTeamId,
        ];
      })),
  ],
  [
    "invalid physical clock",
    (i) =>
      (i.rawPbpText = mutateJson(
        i.rawPbpText,
        (j) => (j.plays[0].timeInPeriod = "01:99"),
      )),
  ],
  [
    "contradictory GOAL scorer fields",
    (i) =>
      (i.rawPbpText = mutateJson(i.rawPbpText, (j) => {
        const p = j.plays.find((p: any) => p.typeDescKey === "goal");
        p.details.shootingPlayerId = 123;
        p.details.scoringPlayerId = 456;
      })),
  ],
];
for (const [label, change] of changes)
  test("reject paired source " + label, () => {
    const i = structuredClone(inputs[1]);
    change(i);
    assert.throws(() => verifyPairedPsSource(i));
  });
test("1166 cannot silently replace unknown ordinary context with a priced full lineup", () => {
  const i = structuredClone(inputs[2]),
    p = load(i.primaryHtml);
  const tr = p("tr")
    .toArray()
    .find((tr) => p(tr).children("td").first().text().trim() === "153");
  p(tr!).children("td").eq(6).text("11 C 14 C 84 R 44 D 51 D 41 G");
  i.primaryHtml = p.html();
  assert.throws(() => verifyPairedPsSource(i));
});
test("0727 differing full native payloads cannot receive equivalence slots", () => {
  const i = structuredClone(inputs[0]);
  i.rawPbpText = mutateJson(
    i.rawPbpText,
    (j) => j.plays.find((p: any) => p.eventId === 11073101).details.homeSOG++,
  );
  assert.throws(() => verifyPairedPsSource(i));
});
test("actual GS0868 supplies only explicit source-bound fields and leaves input unchanged", () => {
  const before = JSON.stringify(gs),
    p = verifyGs0868Supplement(gs);
  assert.deepEqual(p.supplementalPenalty, {
    ordinal: 299,
    period: 3,
    second: 893,
    teamId: 22,
    committedByPlayerId: 8460504,
    typeCode: "MIN",
    duration: 2,
    offence: "Instigator",
  });
  assert.equal(JSON.stringify(gs), before);
});
for (const [label, change] of [
  [
    "wrong source number",
    (i: any) =>
      (i.summaryHtml = i.summaryHtml.replaceAll("Game 0868", "Game 0869")),
  ],
  [
    "wrong summary offence",
    (i: any) =>
      (i.summaryHtml = i.summaryHtml.replace("Instigator", "Roughing")),
  ],
  [
    "wrong native duration",
    (i: any) =>
      (i.rawPbpText = mutateJson(
        i.rawPbpText,
        (j) =>
          (j.plays.find((p: any) => p.eventId === 11750000).details.duration =
            4),
      )),
  ],
  [
    "wrong actor",
    (i: any) =>
      (i.rawPbpText = mutateJson(
        i.rawPbpText,
        (j) =>
          (j.rosterSpots.find((p: any) => p.playerId === 8460504).teamId = 25),
      )),
  ],
  [
    "wrong drawn by",
    (i: any) =>
      (i.rawPbpText = mutateJson(
        i.rawPbpText,
        (j) =>
          (j.plays.find(
            (p: any) => p.eventId === 11750000,
          ).details.drawnByPlayerId = 123),
      )),
  ],
  [
    "already populated PL fields",
    (i: any) => {
      const p = load(i.primaryHtml);
      const tr = p("tr")
        .toArray()
        .find(
          (tr) =>
            p(tr).children("td").length === 8 &&
            p(tr).children("td").first().text().trim() === "299",
        );
      p(tr!)
        .children("td")
        .eq(5)
        .text("EDM #18 MOREAU Instigator(2 min) Drawn By: DAL #29 OTT");
      i.primaryHtml = p.html();
    },
  ],
] as const)
  test("reject GS supplement " + label, () => {
    const i = structuredClone(gs);
    change(i);
    assert.throws(() => verifyGs0868Supplement(i));
  });
test("1114 preserves distinct report-only award and two original native penalties without inventing a play", () => {
  const before = JSON.stringify(award),
    p = verify1114ReportOnlyPsAward(award);
  assert.equal(p.reportOnlyAward.nativeEventId, null);
  assert.equal(p.reportOnlyAward.penaltyMinutes, 0);
  assert.equal(p.reportOnlyAward.priceablePenalty, false);
  assert.equal(p.ordinaryPenaltyIdentities.length, 2);
  assert.equal(p.terminalPenaltyShotEventId, 11096795);
  assert.equal(JSON.stringify(award), before);
});
for (const [label, change] of [
  [
    "wrong game",
    (i: any) =>
      (i.rawPbpText = mutateJson(i.rawPbpText, (j) => (j.id = 2008021115))),
  ],
  [
    "changed native PIM",
    (i: any) =>
      (i.rawPbpText = mutateJson(
        i.rawPbpText,
        (j) =>
          (j.plays.find((p: any) => p.eventId === 11752681).details.duration =
            2),
      )),
  ],
  [
    "changed PS goalie",
    (i: any) =>
      (i.rawPbpText = mutateJson(
        i.rawPbpText,
        (j) =>
          (j.plays.find(
            (p: any) => p.eventId === 11096795,
          ).details.goalieInNetId = 123),
      )),
  ],
  ["changed PS ledger", (i: any) => (i.totals[0].penaltyShotsGoals = 1)],
  [
    "extra native award",
    (i: any) =>
      (i.rawPbpText = mutateJson(i.rawPbpText, (j) =>
        j.plays.push({
          eventId: 999,
          periodDescriptor: { number: 2 },
          timeInPeriod: "11:04",
          typeDescKey: "penalty",
          details: { typeCode: "PS", duration: 0 },
        }),
      )),
  ],
  [
    "changed award PIM",
    (i: any) => {
      const p = load(i.primaryHtml);
      const tr = p("tr")
        .toArray()
        .find(
          (tr) =>
            p(tr).children("td").length === 8 &&
            p(tr).children("td").first().text().trim() === "170",
        );
      p(tr!)
        .children("td")
        .eq(5)
        .text("COL #14 LAPERRIERE PS - Thow object at puck(2 min), Def. Zone");
      i.primaryHtml = p.html();
    },
  ],
  [
    "extra source award",
    (i: any) => {
      const p = load(i.primaryHtml);
      const tr = p("tr")
        .toArray()
        .find(
          (tr) =>
            p(tr).children("td").length === 8 &&
            p(tr).children("td").first().text().trim() === "170",
        );
      const copy = p(tr!).clone();
      copy.children("td").first().text("999");
      p(tr!).after(copy);
      i.primaryHtml = p.html();
    },
  ],
] as const)
  test("reject report-only award " + label, () => {
    const i = structuredClone(award);
    change(i);
    assert.throws(() => verify1114ReportOnlyPsAward(i));
  });
