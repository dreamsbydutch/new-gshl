import { load } from "cheerio";
import { createHash } from "node:crypto";
import { reviewedBoundary2008Cases } from "./boundary-shift-2008-cases";
import { clockSeconds } from "./game-value-input";
import { parseOfficialShiftReport } from "./official-shift-report";

type Shift = ReturnType<typeof parseOfficialShiftReport>[number];
type Player = {
  playerId: number;
  teamId: number;
  sweaterNumber: number;
  positionCode: string;
  firstName?: { default: string };
  lastName: { default: string };
};
type Game = {
  id: number;
  gameDate: string;
  homeTeam: { id: number };
  awayTeam: { id: number };
  rosterSpots: Player[];
  plays: Array<{
    eventId: number;
    typeDescKey: string;
    periodDescriptor: { number: number; periodType: string };
    timeInPeriod: string;
    details?: Record<string, unknown>;
  }>;
};
type Box = {
  id: number;
  gameDate: string;
  playerByGameStats: Record<
    string,
    Record<string, Array<{ playerId: number; toi: string }>>
  >;
};
export const BOUNDARY_SHIFT_GAMES = [
  2009020157,
  2009020275,
  2009020482,
  2009020494,
  2009020609,
  2009020652,
  2009020898,
  2009021030,
  2009021038,
  2009021067,
  2009020541,
  2009021098,
  2009021131,
  2009021141,
  2009021170,
  2009021132,
  ...Object.keys(reviewedBoundary2008Cases).map(Number),
] as const;
export type BoundaryShiftProof = {
  version: "nhl-reviewed-boundary-shifts-v1";
  gameId: number;
  parserBindingSha256: string;
  evidence: Array<{ role: string; url: string; sha256: string }>;
  derivedShiftsSha256: string;
  derivedBoxSha256: string;
  effectivePbpSha256: string;
  recoveredShiftsSha256: string;
  reconciliationSha256: string;
  review: { reason: string; evidenceSha256: string };
};
type ExactRow = {
  id: number;
  role: "skater" | "goalie";
  period: number;
  start: number;
  end: number;
  duration: number;
  fields: string[];
};
export type Spec = {
  /** One exact opposite-side companion only; never an arbitrary recursion. */
  companion?: Spec;
  exactRows?: ExactRow[];
  summaryHeader?: string[];
  expectedSource?: {
    date: string;
    homeTeamId: number;
    awayTeamId: number;
    reportSha256: string;
  };
  exactOvertimeEnd?: number | null;
  home: boolean;
  period: number;
  skaters: Record<
    number,
    { start: number; end: number; duration: number; period?: number }
  >;
  additionalSkaterRows?: Array<{
    id: number;
    period: number;
    start: number;
    end: number;
    duration: number;
  }>;
  goalie?: { id: number; period: number; end: number; duration: number };
};
const specifications: Record<number, Spec> = {
  2009020157: {
    home: false,
    period: 1,
    skaters: Object.fromEntries(
      [8458229, 8469508, 8470655, 8468478, 8471392].map((id) => [
        id,
        {
          start: 1193,
          end: id === 8469508 ? 51 : 0,
          duration: id === 8469508 ? 2625 : 2574,
        },
      ]),
    ),
  },
  2009020275: {
    home: false,
    period: 3,
    skaters: Object.fromEntries(
      [8470121, 8458637, 8470755, 8470606, 8468526].map((id) => [
        id,
        {
          start: id === 8468526 ? 1160 : 1182,
          end: 0,
          duration: id === 8468526 ? 3507 : 3485,
        },
      ]),
    ),
    goalie: { id: 8471734, period: 3, end: 300, duration: 1200 },
  },
  2009020482: {
    home: true,
    period: 2,
    skaters: Object.fromEntries(
      [8468309, 8460541, 8470775, 8465024, 8459433].map((id) => [
        id,
        { start: 1155, end: 0, duration: 2612 },
      ]),
    ),
    goalie: { id: 8460806, period: 2, end: 55, duration: 55 },
  },
  2009020494: {
    home: true,
    period: 2,
    skaters: Object.fromEntries(
      [8471748, 8472382, 8470610, 8459457, 8471233, 8469665].map((id) => [
        id,
        {
          start: id === 8472382 ? 1187 : 1167,
          end: id === 8472382 ? 46 : 0,
          duration: id === 8472382 ? 2626 : 2600,
        },
      ]),
    ),
  },
  2009020609: {
    home: false,
    period: 3,
    skaters: {
      8467361: { start: 1154, end: 45, duration: 3558 },
      8459094: { start: 1154, end: 0, duration: 3513 },
      8459424: { start: 1154, end: 83, duration: 3596 },
      8459670: { start: 1109, end: 83, duration: 41 },
    },
    goalie: { id: 8468038, period: 3, end: 117, duration: 1017 },
  },
  2009020652: {
    home: true,
    period: 2,
    skaters: {
      8469555: { start: 1165, end: 57, duration: 2659 },
      8470609: { start: 1196, end: 0, duration: 2571 },
      8471664: { start: 1191, end: 0, duration: 2576 },
      8469581: { start: 1196, end: 0, duration: 2571 },
      8470839: { start: 1196, end: 52, duration: 2623 },
    },
  },
  2009020898: {
    home: true,
    period: 1,
    skaters: {
      8472382: { start: 1149, end: 0, duration: 2618 },
      8459457: { start: 1165, end: 0, duration: 2602 },
      8471233: { start: 1158, end: 0, duration: 2609 },
      8460542: { start: 1165, end: 40, duration: 2642 },
      8466309: { start: 1149, end: 40, duration: 2658 },
    },
  },
  2009021030: {
    home: false,
    period: 1,
    skaters: {
      8465042: { start: 1197, end: 65, duration: 2635 },
      8469485: { start: 1197, end: 0, duration: 2570 },
      8470598: { start: 1197, end: 0, duration: 2570 },
      8469506: { start: 1197, end: 65, duration: 2635 },
      8471388: { start: 1197, end: 0, duration: 2570 },
      8471284: { start: 1162, end: 53, duration: 2658 },
    },
  },
  2009021038: {
    home: true,
    period: 2,
    skaters: {
      8469555: { start: 1182, end: 0, duration: 2585 },
      8470616: { start: 1192, end: 0, duration: 2575 },
      8467463: { start: 1192, end: 0, duration: 2575 },
      8459648: { start: 1192, end: 0, duration: 2575 },
      8469626: { start: 1166, end: 0, duration: 2601 },
    },
  },
  2009021131: {
    home: true,
    period: 2,
    skaters: {
      "8469623": { start: 1112, end: 38, duration: 2693, period: 2 },
      "8470613": { start: 1197, end: 0, duration: 2570, period: 2 },
      "8449895": { start: 1156, end: 0, duration: 2611, period: 2 },
      "8473504": { start: 1156, end: 0, duration: 2611, period: 2 },
      "8473536": { start: 1197, end: 0, duration: 2570, period: 2 },
    },
    goalie: { id: 8473404, period: 2, end: 407, duration: 407 },
  },
  2009021141: {
    home: false,
    period: 2,
    skaters: {
      "8469760": { start: 1180, end: 81, duration: 2668, period: 1 },
      "8471691": { start: 1180, end: 81, duration: 2668, period: 1 },
      "8468085": { start: 1167, end: 37, duration: 2637, period: 2 },
      "8471279": { start: 1167, end: 0, duration: 2600, period: 2 },
      "8471232": { start: 1180, end: 81, duration: 2668, period: 1 },
      "8459053": { start: 1167, end: 0, duration: 2600, period: 2 },
      "8460492": { start: 1180, end: 81, duration: 2668, period: 1 },
    },
    additionalSkaterRows: [
      { id: 8471691, start: 1167, end: 52, duration: 2652, period: 2 },
    ],
  },
  2009021170: {
    home: false,
    period: 2,
    skaters: {
      "8468483": { start: 1153, end: 18, duration: 2632, period: 2 },
      "8471686": { start: 1153, end: 32, duration: 2646, period: 2 },
      "8459492": { start: 1152, end: 0, duration: 2615, period: 2 },
      "8470299": { start: 1153, end: 18, duration: 2632, period: 2 },
      "8465058": { start: 1153, end: 0, duration: 2614, period: 2 },
    },
  },
  2009021132: {
    home: false,
    period: 2,
    skaters: {
      8462196: { start: 1128, end: 56, duration: 2695 },
      8459024: { start: 1150, end: 56, duration: 2673 },
      8468505: { start: 1192, end: 0, duration: 2575 },
      8467519: { start: 1174, end: 56, duration: 2649 },
    },
    goalie: { id: 8470140, period: 2, end: 1102, duration: 1102 },
  },
  2009020541: {
    home: true,
    period: 2,
    skaters: {
      8469760: { start: 1153, end: 85, duration: 2699 },
      8470105: { start: 1184, end: 0, duration: 2583 },
      8468695: { start: 1184, end: 0, duration: 2583 },
      8462038: { start: 1184, end: 0, duration: 2583 },
      8460492: { start: 1182, end: 62, duration: 2647 },
    },
    goalie: { id: 8468524, period: 2, end: 540, duration: 540 },
  },
  2009021098: {
    home: true,
    period: 1,
    skaters: {
      8468309: { start: 1196, end: 46, duration: 2617 },
      8465024: { start: 1196, end: 0, duration: 2571 },
      8470176: { start: 1196, end: 0, duration: 2571 },
      8474519: { start: 1196, end: 0, duration: 2571 },
      8470144: { start: 1196, end: 0, duration: 2571 },
    },
  },
  2009021067: {
    home: true,
    period: 2,
    skaters: {
      8467452: { start: 1200, end: 34, duration: 2601 },
      8474563: { start: 1173, end: 34, duration: 2628 },
      8471685: { start: 1176, end: 43, duration: 2634 },
      8470755: { start: 1186, end: 51, duration: 2632 },
      8474190: { start: 1200, end: 51, duration: 2618 },
    },
  },
};
Object.assign(specifications, reviewedBoundary2008Cases);
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
const clock = (n: number) =>
  `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
const seconds = (p: number) => (p <= 3 ? 1200 : 300);
export function validateBoundaryShiftProof(proof: BoundaryShiftProof) {
  if (
    proof.version !== "nhl-reviewed-boundary-shifts-v1" ||
    !BOUNDARY_SHIFT_GAMES.some((id) => id === proof.gameId)
  )
    throw Error("Unsupported reviewed boundary-shift scope");
  if (
    !proof.review?.reason.trim() ||
    !proof.evidence.length ||
    new Set(proof.evidence.map((e) => e.url)).size !== proof.evidence.length ||
    [
      proof.parserBindingSha256,
      proof.derivedShiftsSha256,
      proof.derivedBoxSha256,
      proof.effectivePbpSha256,
      proof.recoveredShiftsSha256,
      proof.reconciliationSha256,
      proof.review.evidenceSha256,
      ...proof.evidence.map((e) => e.sha256),
    ].some((h) => !/^[a-f0-9]{64}$/.test(h))
  )
    throw Error("Invalid boundary-shift review/hash binding");
}

/** Exact reviewed malformed rows only. Originals are never edited. A derived
 * report is parsed by the unchanged strict parser, then every player's complete
 * period and game exposure is independently reconciled against native sources. */
export function reconcileBoundaryShiftReports(
  raw: unknown,
  rawBox: unknown,
  reports: { home: string; away: string },
  apiShifts: unknown[],
) {
  const spec = specifications[(raw as Game).id];
  if (!spec?.companion)
    return reconcileBoundarySide(raw, rawBox, reports, apiShifts, spec);
  const companion = spec.companion;
  if (
    companion === spec ||
    companion.companion !== undefined ||
    companion.home === spec.home ||
    !spec.expectedSource ||
    !companion.expectedSource ||
    spec.expectedSource.date !== companion.expectedSource.date ||
    spec.expectedSource.homeTeamId !== companion.expectedSource.homeTeamId ||
    spec.expectedSource.awayTeamId !== companion.expectedSource.awayTeamId
  )
    throw Error("Invalid exact opposite-side boundary companion");
  // Normalize both exact raw reports in memory first. Nothing is returned until
  // BOTH complete strict per-side conservation and witness checks succeed.
  const primaryPrepared = prepareBoundaryReport(
    raw,
    rawBox,
    reports,
    apiShifts,
    spec,
  );
  const companionPrepared = prepareBoundaryReport(
    raw,
    rawBox,
    reports,
    apiShifts,
    companion,
  );
  const primary = reconcileBoundarySide(
    raw,
    rawBox,
    {
      ...reports,
      [companion.home ? "home" : "away"]: companionPrepared.html,
    },
    apiShifts,
    spec,
  );
  const secondary = reconcileBoundarySide(
    raw,
    rawBox,
    {
      ...reports,
      [spec.home ? "home" : "away"]: primaryPrepared.html,
    },
    apiShifts,
    companion,
  );
  if (JSON.stringify(primary.shifts) !== JSON.stringify(secondary.shifts))
    throw Error("Reviewed boundary sides disagree on combined intervals");
  const a = primary.shiftRecovery,
    b = secondary.shiftRecovery;
  const translated = [
    ...(a.reviewedSummaryHeaderTranslations ?? []),
    ...(b.reviewedSummaryHeaderTranslations ?? []),
  ];
  return {
    shifts: primary.shifts,
    shiftRecovery: {
      ...a,
      recoveredSide: "both",
      corrections: [...a.corrections, ...b.corrections],
      players: [...a.players, ...b.players],
      ...(translated.length
        ? { reviewedSummaryHeaderTranslations: translated }
        : {}),
      goalieWitnesses: a.goalieWitnesses + b.goalieWitnesses,
      auxiliaryShiftCountWarnings: [
        ...a.auxiliaryShiftCountWarnings,
        ...b.auxiliaryShiftCountWarnings,
      ],
      unchangedOppositeSideIntervals: 0,
      companionReview: {
        ...b,
        unchangedOppositeSideIntervals: 0,
        interpretation:
          "This companion side independently passes every conservation check; its opposite side is separately reviewed, not unchanged raw input.",
      },
      interpretation:
        "Both exact raw reports independently pass complete period, strength, native TOI and actor/goalie witness checks. No opposite side is claimed unchanged; original sources retained.",
    },
  };
}

function prepareBoundaryReport(
  raw: unknown,
  rawBox: unknown,
  reports: { home: string; away: string },
  apiShifts: unknown[],
  spec: Spec | undefined,
) {
  const game = raw as Game,
    box = rawBox as Box;
  if (
    !spec ||
    box.id !== game.id ||
    box.gameDate !== game.gameDate ||
    !Array.isArray(apiShifts) ||
    apiShifts.length
  )
    throw Error("Unsupported boundary source identity/API alternative");
  const side = spec.home ? "home" : "away",
    teamId = spec.home ? game.homeTeam.id : game.awayTeam.id,
    $ = load(reports[side]);
  if (
    spec.expectedSource &&
    (game.gameDate !== spec.expectedSource.date ||
      game.homeTeam.id !== spec.expectedSource.homeTeamId ||
      game.awayTeam.id !== spec.expectedSource.awayTeamId ||
      (raw as { gameType?: number }).gameType !== 2 ||
      createHash("sha256").update(reports[side]).digest("hex") !==
        spec.expectedSource.reportSha256)
  )
    throw Error("Exact boundary report/source scope changed");
  const corrections: Array<{
    playerId: number;
    original: string[];
    replacements: Array<{ period: number; start: number; end: number }>;
  }> = [];
  const translatedHeaders: Array<{
    playerId: number;
    original: string[];
    normalized: string[];
  }> = [];
  const summaries = new Map<number, Map<number | string, string[]>>(),
    reportPlayers = new Set<number>(),
    shiftIds = new Map<number, Set<string>>();
  let current: Player | undefined;
  const expectedSkaterRows: Array<{
    id: number;
    period: number;
    start: number;
    end: number;
    duration: number;
    role?: "skater" | "goalie";
    fields?: string[];
  }> = [
    ...Object.entries(spec.skaters).map(([id, value]) => ({
      id: Number(id),
      ...value,
      period: value.period ?? spec.period,
    })),
    ...(spec.additionalSkaterRows ?? []),
    ...(spec.exactRows ?? []),
  ];
  const rowKey = (id: number, period: number, start: number) =>
    `${id}:${period}:${start}`;
  const candidates: Array<{
    row: ReturnType<typeof $>;
    player: Player;
    fields: string[];
    period: number;
    start: number;
    end: number;
    duration: number;
  }> = [];
  $("tr").each((_, tr) => {
    const row = $(tr),
      heading = row.children("td.playerHeading").text().trim();
    if (heading) {
      const m = heading.match(/^(\d+)\s+(.+?),\s+(.+)$/);
      if (!m) throw Error("Malformed boundary player heading");
      const found = game.rosterSpots.filter(
        (p) =>
          p.teamId === teamId &&
          p.sweaterNumber === Number(m[1]) &&
          (norm(p.lastName.default) === norm(m[2]!) ||
            (p.playerId === 8471269 &&
              norm(p.firstName?.default ?? "") === "NICKLAS" &&
              norm(m[3]!) === "NICKLAS" &&
              norm(p.lastName.default) === "GROSSMANN" &&
              norm(m[2]!) === "GROSSMAN")),
      );
      if (found.length !== 1 || reportPlayers.has(found[0]!.playerId))
        throw Error("Unverified/duplicate boundary player identity");
      current = found[0];
      reportPlayers.add(current!.playerId);
      summaries.set(current!.playerId, new Map());
      shiftIds.set(current!.playerId, new Set());
    }
    if (spec.summaryHeader && current) {
      const cells = row.children("td"),
        source = cells
          .toArray()
          .map((c) => $(c).text().replace(/\s+/g, " ").trim());
      if (JSON.stringify(source) === JSON.stringify(spec.summaryHeader)) {
        const normalized = [
          "Per",
          "SHF",
          "AVG",
          "TOI",
          "EV TOT",
          "PP TOT",
          "SH TOT",
        ];
        normalized.forEach((label, i) => cells.eq(i).text(label));
        translatedHeaders.push({
          playerId: current.playerId,
          original: source,
          normalized,
        });
      }
    }
    const f = row
      .children("td")
      .toArray()
      .map((c) => $(c).text().replace(/\s+/g, " ").trim());
    if (!current) return;
    if (f.length === 7 && /^(?:[1-3]|OT|TOT)$/.test(f[0]!)) {
      const key = f[0] === "TOT" ? "TOT" : f[0] === "OT" ? 4 : Number(f[0]);
      if (summaries.get(current.playerId)!.has(key))
        throw Error("Duplicate boundary period summary");
      summaries.get(current.playerId)!.set(key, f);
    }
    if (
      f.length !== 6 ||
      !/^\d+$/.test(f[0]!) ||
      !f[2]!.includes("/") ||
      !f[3]!.includes("/")
    )
      return;
    if (shiftIds.get(current.playerId)!.has(f[0]!))
      throw Error("Duplicate original boundary shift number");
    shiftIds.get(current.playerId)!.add(f[0]!);
    const period = f[1] === "OT" ? 4 : Number(f[1]),
      start = clockSeconds(f[2]!.split("/")[0]!.trim()),
      end = clockSeconds(f[3]!.split("/")[0]!.trim()),
      duration = clockSeconds(f[4]);
    const expected = expectedSkaterRows.find(
        (r) =>
          r.id === current!.playerId &&
          r.period === period &&
          r.start === start,
      ),
      goalie = spec.goalie?.id === current.playerId ? spec.goalie : undefined;
    if (
      (expected && period === expected.period && start === expected.start) ||
      (goalie && period === goalie.period && start === 0)
    )
      candidates.push({
        row,
        player: current,
        fields: f,
        period,
        start,
        end,
        duration,
      });
  });
  if (
    spec.summaryHeader &&
    (translatedHeaders.length !== reportPlayers.size ||
      new Set(translatedHeaders.map((h) => h.playerId)).size !==
        reportPlayers.size)
  )
    throw Error("Missing/duplicate exact reviewed bilingual summary header");
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const { row, player, fields: f, period, start, end, duration } = candidate,
      expected = expectedSkaterRows.find(
        (r) =>
          r.id === player.playerId && r.period === period && r.start === start,
      ),
      goalie = spec.goalie?.id === player.playerId ? spec.goalie : undefined;
    if (seen.has(rowKey(player.playerId, period, start)))
      throw Error("Ambiguous reviewed boundary row");
    seen.add(rowKey(player.playerId, period, start));
    if (expected) {
      if (
        (expected.role === "goalie"
          ? player.positionCode !== "G"
          : player.positionCode === "G") ||
        (expected.fields !== undefined &&
          JSON.stringify(f) !== JSON.stringify(expected.fields)) ||
        period !== expected.period ||
        start !== expected.start ||
        end !== expected.end ||
        duration !== expected.duration
      )
        throw Error("Reviewed boundary row changed");
    } else if (
      !goalie ||
      player.positionCode !== "G" ||
      period !== goalie.period ||
      start !== 0 ||
      end !== goalie.end ||
      duration !== goalie.duration
    )
      throw Error("Reviewed continuous goalie row changed");
    const nextPeriod = period + 1;
    if (
      clockSeconds(f[2]!.split("/")[1]!.trim()) !== seconds(period) - start ||
      clockSeconds(f[3]!.split("/")[1]!.trim()) !== seconds(nextPeriod) - end
    )
      throw Error("Boundary dual clocks do not identify adjacent periods");
    const replacements = [
      { period, start, end: seconds(period) },
      ...(end > 0 ? [{ period: nextPeriod, start: 0, end }] : []),
    ];
    const writeRow = (
      target: ReturnType<typeof $>,
      part: (typeof replacements)[number],
      number: string,
    ) => {
      const cells = target.children("td");
      cells.eq(0).text(number);
      cells.eq(1).text(part.period === 4 ? "OT" : String(part.period));
      cells
        .eq(2)
        .text(
          `${clock(part.start)} / ${clock(seconds(part.period) - part.start)}`,
        );
      cells
        .eq(3)
        .text(`${clock(part.end)} / ${clock(seconds(part.period) - part.end)}`);
      cells.eq(4).text(clock(part.end - part.start));
    };
    if (replacements.length > 1) {
      const number = String(1000000 + Number(f[0]));
      if (shiftIds.get(player.playerId)!.has(number))
        throw Error("Derived boundary shift number collision");
      const next = row.clone();
      writeRow(next, replacements[1]!, number);
      row.after(next);
    }
    writeRow(row, replacements[0]!, f[0]!);
    corrections.push({ playerId: player.playerId, original: f, replacements });
  }
  if (
    expectedSkaterRows.some(
      (r) => !seen.has(rowKey(r.id, r.period, r.start)),
    ) ||
    (spec.goalie && !seen.has(rowKey(spec.goalie.id, spec.goalie.period, 0)))
  )
    throw Error("Missing reviewed boundary row");
  return {
    spec,
    game,
    box,
    side,
    teamId,
    html: $.html(),
    reportPlayers,
    summaries,
    corrections,
    translatedHeaders,
  };
}

function reconcileBoundarySide(
  raw: unknown,
  rawBox: unknown,
  reports: { home: string; away: string },
  apiShifts: unknown[],
  selectedSpec: Spec | undefined,
) {
  const prepared = prepareBoundaryReport(
    raw,
    rawBox,
    reports,
    apiShifts,
    selectedSpec,
  );
  const {
    spec,
    game,
    box,
    side,
    teamId,
    html,
    reportPlayers,
    summaries,
    corrections,
    translatedHeaders,
  } = prepared;
  const repaired = parseOfficialShiftReport(html, game, spec.home, apiShifts),
    other = parseOfficialShiftReport(
      reports[spec.home ? "away" : "home"],
      game,
      !spec.home,
      apiShifts,
    );
  const native = Object.values(
    box.playerByGameStats[spec.home ? "homeTeam" : "awayTeam"]!,
  ).flat();
  if (
    native.length !== reportPlayers.size ||
    new Set(native.map((p) => p.playerId)).size !== native.length ||
    native.some((p) => !reportPlayers.has(p.playerId))
  )
    throw Error("Boundary official appearance cohort differs");
  const players = native.map((p) => {
    const summary = summaries.get(p.playerId)!,
      total = summary.get("TOT");
    if (!total) throw Error("Missing boundary total TOI");
    const intervals = repaired.filter((s) => s.playerId === p.playerId),
      periods = [...summary.entries()]
        .filter(([key]) => key !== "TOT")
        .map(([key, f]) => {
          const period = Number(key),
            ordered = intervals
              .filter((s) => s.period === period)
              .sort(
                (a, b) => clockSeconds(a.startTime) - clockSeconds(b.startTime),
              );
          const intervalSeconds = ordered.reduce(
              (n, s) => n + clockSeconds(s.endTime) - clockSeconds(s.startTime),
              0,
            ),
            officialSeconds = clockSeconds(f[3]);
          if (
            intervalSeconds !== officialSeconds ||
            f.slice(4).reduce((n, s) => n + clockSeconds(s), 0) !==
              officialSeconds ||
            ordered.some(
              (s, i) =>
                clockSeconds(s.startTime) < 0 ||
                clockSeconds(s.endTime) > seconds(period) ||
                (i > 0 &&
                  clockSeconds(ordered[i - 1]!.endTime) >
                    clockSeconds(s.startTime)),
            )
          )
            throw Error(
              "Boundary period/strength TOI or interval conservation failed",
            );
          return {
            period,
            intervalSeconds,
            officialSeconds,
            sourceShiftCount: /^\d+$/.test(f[1]!) ? Number(f[1]) : null,
            recoveredIntervals: ordered.length,
          };
        });
    const intervalSeconds = intervals.reduce(
        (n, s) => n + clockSeconds(s.endTime) - clockSeconds(s.startTime),
        0,
      ),
      nativeSeconds = clockSeconds(p.toi);
    if (
      intervalSeconds !== nativeSeconds ||
      intervalSeconds !== clockSeconds(total[3]) ||
      periods.reduce((n, s) => n + s.officialSeconds, 0) !== intervalSeconds ||
      total.slice(4).reduce((n, s) => n + clockSeconds(s), 0) !==
        intervalSeconds ||
      intervals.some((s) => !summary.has(s.period))
    )
      throw Error("Boundary native/game TOI conservation failed");
    return { playerId: p.playerId, nativeSeconds, intervalSeconds, periods };
  });
  const inclusive = (s: Shift, period: number, t: number) =>
    s.period === period &&
    clockSeconds(s.startTime) <= t &&
    t <= clockSeconds(s.endTime);
  const goalieIds = new Set(
    game.rosterSpots
      .filter((p) => p.teamId === teamId && p.positionCode === "G")
      .map((p) => p.playerId),
  );
  let goalieWitnesses = 0;
  for (const event of game.plays) {
    if (event.periodDescriptor.periodType === "SO") continue;
    const id = Number(event.details?.goalieInNetId),
      period = event.periodDescriptor.number,
      t = clockSeconds(event.timeInPeriod);
    if (goalieIds.has(id)) {
      goalieWitnesses++;
      if (!repaired.some((s) => s.playerId === id && inclusive(s, period, t)))
        throw Error("Boundary goalie witness outside recovered intervals");
      if (
        repaired.some(
          (s) =>
            goalieIds.has(s.playerId) &&
            s.playerId !== id &&
            s.period === period &&
            clockSeconds(s.startTime) < t &&
            t < clockSeconds(s.endTime),
        )
      )
        throw Error("Boundary opposing goalie interior contradiction");
    }
    const actor = Number(
      event.details?.scoringPlayerId ?? event.details?.shootingPlayerId,
    );
    if (
      (spec.exactRows ? reportPlayers.has(actor) : spec.skaters[actor]) &&
      !repaired.some((s) => s.playerId === actor && inclusive(s, period, t))
    )
      throw Error("Boundary skater actor outside recovered intervals");
  }
  const expectedGoalieOvertimeEnd =
    spec.exactOvertimeEnd ??
    (spec.goalie?.period === 3 ? spec.goalie.end : null);
  const observedOvertimeEnd = game.plays
    .filter(
      (e) =>
        e.periodDescriptor.periodType !== "SO" &&
        e.periodDescriptor.number === 4,
    )
    .reduce((end, e) => Math.max(end, clockSeconds(e.timeInPeriod)), 0);
  if (
    expectedGoalieOvertimeEnd !== null &&
    observedOvertimeEnd !== expectedGoalieOvertimeEnd
  )
    throw Error(
      "Reviewed overtime goalie exposure lacks exact actual period-end witness",
    );
  const auxiliaryShiftCountWarnings = players.flatMap((p) =>
    p.periods
      .filter(
        (period) =>
          period.sourceShiftCount !== null &&
          period.sourceShiftCount !== period.recoveredIntervals,
      )
      .map((period) => ({
        playerId: p.playerId,
        period: period.period,
        sourceShiftCount: period.sourceShiftCount,
        recoveredIntervals: period.recoveredIntervals,
        interpretation:
          "Auxiliary reported shift counter is not a timed-exposure proof or estimator input.",
      })),
  );
  const shifts = spec.home ? [...repaired, ...other] : [...other, ...repaired];
  return {
    shifts,
    shiftRecovery: {
      version: "nhl-reviewed-boundary-shifts-v1",
      gameId: game.id,
      recoveredSide: side,
      corrections,
      players,
      ...(translatedHeaders.length
        ? { reviewedSummaryHeaderTranslations: translatedHeaders }
        : {}),
      goalieWitnesses,
      auxiliaryShiftCountWarnings,
      unchangedOppositeSideIntervals: other.length,
      interpretation:
        "Explicit raw adjacent-period endpoints reconciled uniquely against every official period and native appearance total. Original bytes retained; no strength/count inference or source gate changes.",
    },
  };
}
