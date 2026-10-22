import { parseOfficialShiftReport } from "./official-shift-report";
import { createHash } from "node:crypto";
import type { OfficialPeriodEnd } from "./official-game-clock";

export const UNAVAILABLE_SHIFT_GAME_IDS = [
  2009020002, 2009020079, 2009020081, 2009020439, 2009020658, 2009020885,
  2009021112, 2008020160, 2008020259, 2008020409, 2008020967, 2008021077,
] as const;
export type ShiftReportOutcome =
  | {
      status: "unavailable";
      error:
        | "Invalid official report shift interval"
        | "Malformed shift report player heading"
        | "Wrong shift report date"
        | "Unverified shift-report jersey 36"
        | "Unverified shift-report jersey 8"
        | "Official shift report contains no verified shifts";
    }
  | { status: "verified"; intervals: number };
export type UnavailableShiftProof = {
  version: "nhl-reviewed-unavailable-shifts-v1";
  gameId: number;
  parserBindingSha256: string;
  evidence: Array<{ role: string; url: string; sha256: string }>;
  derivedShiftsSha256: string;
  derivedBoxSha256: string;
  effectivePbpSha256: string;
  outcomes: { home: ShiftReportOutcome; away: ShiftReportOutcome };
  officialPeriodEnds?: OfficialPeriodEnd[];
  review: { reason: string; evidenceSha256: string };
};
export type UnavailableShiftInputs = {
  pbp: unknown;
  box: unknown;
  apiShifts: unknown[];
  reports: { home: string; away: string };
  schedule: {
    total: number;
    data: Array<{
      id: number;
      season: number;
      gameType: number;
      gameStateId: number;
      gameDate: string;
      homeTeamId: number;
      visitingTeamId: number;
    }>;
  };
  shiftPages: Array<{
    total: number;
    data: Array<{ id: number; gameId: number }>;
  }>;
};
export type ShiftAvailability = {
  version: UnavailableShiftProof["version"];
  gameId: number;
  downloadedComponents: string[];
  verifiedShiftSides: Array<"home" | "away">;
  unavailableShiftSides: Array<"home" | "away">;
  outcomes: UnavailableShiftProof["outcomes"];
  parserBindingSha256: string;
  review: UnavailableShiftProof["review"];
  interpretation: string;
  officialPeriodEnds?: OfficialPeriodEnd[];
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid unavailable-shift source object");
  return value as Record<string, unknown>;
};
const reviewedErrors: Record<number, { home: string; away: string }> = {
  2008020259: {
    home: "Wrong shift report date",
    away: "Wrong shift report date",
  },
  2008020409: {
    home: "Official shift report contains no verified shifts",
    away: "Official shift report contains no verified shifts",
  },
  2008020967: { home: "Malformed shift report player heading", away: "" },
  2008021077: {
    home: "Official shift report contains no verified shifts",
    away: "Official shift report contains no verified shifts",
  },
  2008020160: { home: "", away: "Unverified shift-report jersey 8" },
  2009020002: {
    home: "Invalid official report shift interval",
    away: "Invalid official report shift interval",
  },
  2009020079: {
    home: "Invalid official report shift interval",
    away: "Malformed shift report player heading",
  },
  2009020081: {
    home: "Wrong shift report date",
    away: "Wrong shift report date",
  },
  2009020439: {
    home: "",
    away: "Unverified shift-report jersey 36",
  },
  2009020658: {
    home: "Official shift report contains no verified shifts",
    away: "Official shift report contains no verified shifts",
  },
  2009020885: {
    home: "Official shift report contains no verified shifts",
    away: "Official shift report contains no verified shifts",
  },
  2009021112: {
    home: "Invalid official report shift interval",
    away: "",
  },
};
const exact2008UnavailableReports: Record<
  number,
  {
    date: string;
    home: number;
    away: number;
    homeSha256: string;
    awaySha256: string;
  }
> = {
  2008020259: {
    date: "2008-11-17",
    home: 10,
    away: 6,
    homeSha256:
      "3884402e2a065261c8455e3629565e87487811e6b871fc2c7ca9dceb71863510",
    awaySha256:
      "2036f446f14618948b1d9cede3ca15e4b05f8e5e7d190c531e4a169e8e1a57a6",
  },
  2008020409: {
    date: "2008-12-10",
    home: 17,
    away: 20,
    homeSha256:
      "3c6bc258abeb394db1cde51761a9b511aa0bc5baae6e37e9d08bf7dce6018b4b",
    awaySha256:
      "fd10bece38cd1d545b4fa7d3d208d7820c8535c09fff1cd46660a518678738a6",
  },
  2008020967: {
    date: "2009-03-06",
    home: 14,
    away: 19,
    homeSha256:
      "f44c56e4372e3f5ff7a76f917ccbcbf538e1df0c6e55627ee53aa78be42a9373",
    awaySha256:
      "8574c670966df42c54732dc61829fd86140f2058c03f2218e04b8346145aaa68",
  },
  2008021077: {
    date: "2009-03-21",
    home: 27,
    away: 23,
    homeSha256:
      "9626374fa719bf1f3448ac8ac95111ba788f6aea7c4bcd8fc3ebba33eda5e865",
    awaySha256:
      "85a128e1689ff74cdcf715b2d19f0aa386e88f6247f1f825289255d57a69b720",
  },
};
export function validateUnavailableShiftScope(proof: UnavailableShiftProof) {
  if (
    proof.version !== "nhl-reviewed-unavailable-shifts-v1" ||
    !UNAVAILABLE_SHIFT_GAME_IDS.some((id) => id === proof.gameId)
  )
    throw new Error("Unsupported unavailable-shift proof scope");
  const hashes = [
    proof.parserBindingSha256,
    proof.derivedShiftsSha256,
    proof.derivedBoxSha256,
    proof.effectivePbpSha256,
    proof.review?.evidenceSha256,
    ...proof.evidence.map((e) => e.sha256),
  ];
  if (
    hashes.some((h) => typeof h !== "string" || !/^[a-f0-9]{64}$/.test(h)) ||
    !proof.review.reason.trim()
  )
    throw new Error("Invalid unavailable-shift review/hash binding");
  if (
    !proof.evidence.length ||
    new Set(proof.evidence.map((e) => e.url)).size !== proof.evidence.length
  )
    throw new Error("Missing or duplicate unavailable-shift evidence");
  if (
    proof.officialPeriodEnds !== undefined &&
    (proof.gameId !== 2009020002 ||
      proof.officialPeriodEnds.length !== 1 ||
      proof.officialPeriodEnds[0]?.period !== 4 ||
      !Number.isInteger(proof.officialPeriodEnds[0]?.seconds) ||
      proof.officialPeriodEnds[0]!.seconds <= 0 ||
      proof.officialPeriodEnds[0]!.seconds > 300)
  )
    throw new Error("Invalid reviewed official period clock");
  for (const side of ["home", "away"] as const) {
    const outcome = proof.outcomes[side];
    if (
      !outcome ||
      (outcome.status !== "verified" && outcome.status !== "unavailable") ||
      (outcome.status === "unavailable" &&
        outcome.error !== reviewedErrors[proof.gameId]![side])
    )
      throw new Error("Unreviewed shift failure class");
  }
}

/** No exception swallowing: only a replayed, exact reviewed corrupt-clock class is admissible. */
export function replayUnavailableShiftProof(
  proof: UnavailableShiftProof,
  inputs: UnavailableShiftInputs,
) {
  validateUnavailableShiftScope(proof);
  const pbp = object(inputs.pbp),
    box = object(inputs.box);
  const home = object(pbp.homeTeam),
    away = object(pbp.awayTeam);
  const exact = exact2008UnavailableReports[proof.gameId];
  if (
    exact &&
    (pbp.gameDate !== exact.date ||
      home.id !== exact.home ||
      away.id !== exact.away ||
      createHash("sha256").update(inputs.reports.home).digest("hex") !==
        exact.homeSha256 ||
      createHash("sha256").update(inputs.reports.away).digest("hex") !==
        exact.awaySha256)
  )
    throw Error("Exact reviewed 2008 unavailable shift source changed");
  if (proof.gameId === 2008020160) {
    const roster = pbp.rosterSpots;
    const native = object(object(box.playerByGameStats).awayTeam);
    if (
      pbp.gameDate !== "2008-11-01" ||
      home.id !== 27 ||
      away.id !== 30 ||
      !Array.isArray(roster) ||
      roster.some((value) => {
        const p = object(value);
        return (
          p.playerId === 8470613 || (p.teamId === 30 && p.sweaterNumber === 8)
        );
      }) ||
      Object.values(native).some(
        (rows) =>
          !Array.isArray(rows) ||
          rows.some((p) => object(p).playerId === 8470613),
      ) ||
      createHash("sha256").update(inputs.reports.away).digest("hex") !==
        "5e470b5bf1a7b6d54dd1d4f02ffb2c2868b5038f470e06ee7205372fc207990f"
    )
      throw Error(
        "Reviewed 0160 positive phantom actor/source identity changed",
      );
  }
  if (
    pbp.id !== proof.gameId ||
    box.id !== proof.gameId ||
    box.gameDate !== pbp.gameDate ||
    !Number.isInteger(home.id) ||
    !Number.isInteger(away.id) ||
    home.id === away.id
  )
    throw new Error("Unavailable-shift game identity conflict");
  const schedule = inputs.schedule;
  if (
    !Array.isArray(schedule.data) ||
    schedule.total !== schedule.data.length ||
    new Set(schedule.data.map((g) => g.id)).size !== schedule.total ||
    schedule.data.some(
      (g) =>
        g.season !== Math.floor(proof.gameId / 1e6) * 10001 + 1 ||
        g.gameType !== 2,
    )
  )
    throw new Error("Incomplete unavailable-shift schedule");
  const game = schedule.data.find((g) => g.id === proof.gameId);
  if (
    !game ||
    game.gameStateId !== 7 ||
    game.gameDate !== pbp.gameDate ||
    game.homeTeamId !== home.id ||
    game.visitingTeamId !== away.id
  )
    throw new Error("Unavailable-shift schedule identity conflict");
  if (!Array.isArray(inputs.apiShifts) || inputs.apiShifts.length)
    throw new Error("Verified API shift alternative must not be discarded");
  const pages = inputs.shiftPages;
  if (
    !pages.length ||
    pages.some(
      (p) =>
        !Number.isInteger(p.total) ||
        p.total < 0 ||
        p.total !== pages[0]!.total ||
        !Array.isArray(p.data),
    ) ||
    pages.reduce((n, p) => n + p.data.length, 0) !== pages[0]!.total
  )
    throw new Error("Incomplete raw API shift pages");
  const rows = pages.flatMap((p) => p.data);
  if (
    new Set(rows.map((r) => r.id)).size !== rows.length ||
    rows.some(
      (r) =>
        !Number.isInteger(r.id) ||
        !Number.isInteger(r.gameId) ||
        r.gameId === proof.gameId,
    )
  )
    throw new Error("Raw API shift alternative/identity conflict");
  const shifts: ReturnType<typeof parseOfficialShiftReport> = [];
  const outcomes = {} as { home: ShiftReportOutcome; away: ShiftReportOutcome };
  for (const side of ["home", "away"] as const) {
    const expected = proof.outcomes[side];
    try {
      const found = parseOfficialShiftReport(
        inputs.reports[side],
        inputs.pbp,
        side === "home",
        [],
      );
      if (
        expected?.status !== "verified" ||
        !Number.isInteger(expected.intervals) ||
        expected.intervals <= 0 ||
        expected.intervals !== found.length
      )
        throw new Error(
          "Reviewed shift failure resolved or verified side changed",
        );
      outcomes[side] = { status: "verified", intervals: found.length };
      shifts.push(...found);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        expected?.status !== "unavailable" ||
        expected.error !== error.message
      )
        throw error;
      outcomes[side] = { status: "unavailable", error: expected.error };
    }
  }
  if (
    outcomes.home.status === "verified" &&
    outcomes.away.status === "verified"
  )
    throw new Error("Unavailable-shift proof cannot discard a recovered game");
  const shiftAvailability: ShiftAvailability = {
    version: proof.version,
    gameId: proof.gameId,
    downloadedComponents: [
      "pbp",
      "box",
      "schedule",
      "api-shifts",
      "home-report",
      "away-report",
      "skater-summary",
      "goalie-summary",
      ...(proof.officialPeriodEnds ? ["game-summary"] : []),
    ],
    verifiedShiftSides: (["home", "away"] as const).filter(
      (s) => outcomes[s].status === "verified",
    ),
    unavailableShiftSides: (["home", "away"] as const).filter(
      (s) => outcomes[s].status === "unavailable",
    ),
    outcomes,
    parserBindingSha256: proof.parserBindingSha256,
    review: { ...proof.review },
    interpretation:
      "Downloaded sources retained; unavailable shift exposure is unknown, never zero contribution.",
    ...(proof.officialPeriodEnds
      ? { officialPeriodEnds: proof.officialPeriodEnds.map((p) => ({ ...p })) }
      : {}),
  };
  return {
    pbp: inputs.pbp,
    box: inputs.box,
    shifts,
    shiftSource: "nhl-toi-report" as const,
    shiftAvailability,
    ...(proof.officialPeriodEnds
      ? { officialPeriodEnds: proof.officialPeriodEnds.map((p) => ({ ...p })) }
      : {}),
  };
}
