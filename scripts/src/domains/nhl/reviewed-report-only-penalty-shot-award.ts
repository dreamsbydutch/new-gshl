import { createHash } from "node:crypto";
import { load } from "cheerio";
import { parseOfficialPenaltyShots } from "./official-penalty-shot-report";
const h = (s: string) => createHash("sha256").update(s).digest("hex"),
  same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b),
  norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z]/g, "");
export type ReportOnlyAwardInput = {
  rawPbpText: string;
  primaryHtml: string;
  totals: Array<{
    gameId: number;
    playerId: number;
    penaltyShotAttempts: number;
    penaltyShotsGoals: number;
  }>;
};
/** No synthetic native play, minutes, penalty value, or source-stat modification. */
export function verify1114ReportOnlyPsAward(input: ReportOnlyAwardInput) {
  const raw = JSON.parse(input.rawPbpText);
  if (
    raw.id !== 2008021114 ||
    raw.season !== 20082009 ||
    raw.gameType !== 2 ||
    raw.gameDate !== "2009-03-27" ||
    raw.homeTeam?.id !== 21 ||
    raw.homeTeam?.abbrev !== "COL" ||
    raw.awayTeam?.id !== 23 ||
    raw.awayTeam?.abbrev !== "VAN"
  )
    throw Error("Wrong report-only award source scope");
  const identities = [
    [8459094, 21, 14, "Ian", "LAPERRIERE"],
    [8459648, 23, 38, "Pavol", "DEMITRA"],
    [8467453, 21, 1, "Andrew", "RAYCROFT"],
  ] as const;
  for (const [id, team, jersey, first, last] of identities) {
    const ps = raw.rosterSpots.filter((p: any) => p.playerId === id);
    if (
      ps.length !== 1 ||
      ps[0].teamId !== team ||
      ps[0].sweaterNumber !== jersey ||
      ps[0].firstName?.default !== first ||
      norm(ps[0].lastName?.default ?? "") !== last ||
      raw.rosterSpots.filter(
        (p: any) => p.teamId === team && p.sweaterNumber === jersey,
      ).length !== 1
    )
      throw Error("Wrong report-only award canonical actor");
  }
  if (
    raw.rosterSpots.find((p: any) => p.playerId === 8467453).positionCode !==
    "G"
  )
    throw Error("Wrong report-only award goalkeeper role");
  if (
    input.totals.length !== 1 ||
    input.totals[0].gameId !== raw.id ||
    input.totals[0].playerId !== 8459648 ||
    input.totals[0].penaltyShotAttempts !== 1 ||
    input.totals[0].penaltyShotsGoals !== 0
  )
    throw Error("Report-only award independent PS ledger differs");
  const p = load(input.primaryHtml),
    cells = p("td")
      .toArray()
      .map((td) => p(td).text().replace(/\s+/g, " ").trim());
  if (
    p("title").text().trim() !== "Play By Play" ||
    !cells.includes("Game 1114") ||
    !cells.includes("Friday, March 27, 2009")
  )
    throw Error("Wrong report-only award primary scope");
  const records = p("tr")
    .toArray()
    .map((tr) =>
      p(tr)
        .children("td")
        .toArray()
        .map((td) => p(td).text().replace(/\s+/g, " ").trim()),
    )
    .filter((r) => r.length === 8 && /^\d+$/.test(r[0]));
  const awards = records.filter(
    (r) => r[4] === "PENL" && /\bPS\s*-.*\(0\s+min\)/i.test(r[5]),
  );
  if (
    awards.length !== 1 ||
    !same(awards[0].slice(0, 6), [
      "170",
      "2",
      "EV",
      "11:048:56",
      "PENL",
      "COL #14 LAPERRIERE PS - Thow object at puck(0 min), Def. Zone",
    ])
  )
    throw Error("Reviewed report-only zero-minute award differs");
  const group = records.filter(
    (r) =>
      r[1] === "2" &&
      r[3] === "11:048:56" &&
      r[4] === "PENL" &&
      /^COL #14 LAPERRIERE\b/.test(r[5]),
  );
  if (
    !same(
      group.map((r) => [r[0], r[5]]),
      [
        [
          "170",
          "COL #14 LAPERRIERE PS - Thow object at puck(0 min), Def. Zone",
        ],
        ["171", "COL #14 LAPERRIERE Misconduct (10 min)(10 min), Def. Zone"],
        ["172", "COL #14 LAPERRIERE Game misconduct(10 min)"],
      ],
    )
  )
    throw Error("Complete report-only award and PIM group differs");
  const terminal = records.filter((r) => r[0] === "173"),
    fac = records.filter((r) => r[0] === "174");
  if (
    terminal.length !== 1 ||
    !same(terminal[0].slice(0, 6), [
      "173",
      "2",
      "EV",
      "11:048:56",
      "SHOT",
      "VAN ONGOAL - #38 DEMITRA, Penalty Shot, Backhand, Off. Zone, 15 ft.",
    ]) ||
    terminal[0][6] !== "38 R" ||
    terminal[0][7] !== "1 G" ||
    fac.length !== 1 ||
    fac[0][1] !== "2" ||
    fac[0][3] !== "11:048:56" ||
    fac[0][4] !== "FAC"
  )
    throw Error("Reviewed isolated terminal PS/following faceoff differs");
  const native = raw.plays.filter(
    (r: any) =>
      r.typeDescKey === "penalty" &&
      r.periodDescriptor?.number === 2 &&
      r.timeInPeriod === "11:04" &&
      r.details?.committedByPlayerId === 8459094,
  );
  if (
    !same(
      native.map((r: any) => [
        r.eventId,
        r.details.eventOwnerTeamId,
        r.details.typeCode,
        r.details.descKey,
        r.details.duration,
      ]),
      [
        [11752681, 21, "MIS", "misconduct", 10],
        [11752682, 21, "GAM", "game-misconduct", 10],
      ],
    )
  )
    throw Error("Native full ordinary PIM group differs");
  if (
    raw.plays.some(
      (r: any) =>
        r.typeDescKey === "penalty" &&
        r.periodDescriptor?.number === 2 &&
        r.timeInPeriod === "11:04" &&
        r.details?.typeCode === "PS",
    )
  )
    throw Error("Award already exists as native penalty");
  const nativeTerminal = raw.plays.filter((r: any) => r.eventId === 11096795);
  if (
    nativeTerminal.length !== 1 ||
    nativeTerminal[0].typeDescKey !== "shot-on-goal" ||
    nativeTerminal[0].periodDescriptor?.number !== 2 ||
    nativeTerminal[0].periodDescriptor?.periodType !== "REG" ||
    nativeTerminal[0].timeInPeriod !== "11:04" ||
    nativeTerminal[0].details?.eventOwnerTeamId !== 23 ||
    nativeTerminal[0].details?.shootingPlayerId !== 8459648 ||
    nativeTerminal[0].details?.goalieInNetId !== 8467453 ||
    nativeTerminal[0].details?.shotType !== "backhand"
  )
    throw Error("Native terminal PS physical identity differs");
  if (
    !same(parseOfficialPenaltyShots(input.primaryHtml, raw, input.totals), [
      11096795,
    ])
  )
    throw Error("Terminal native PS is not uniquely reconciled");
  return {
    version: "nhl-reviewed-report-only-zero-minute-ps-award-v1",
    gameId: raw.id,
    sourceHashes: {
      rawPbpSha256: h(input.rawPbpText),
      inputPbpSha256: h(JSON.stringify(raw)),
      primarySha256: h(input.primaryHtml),
      ledgerSha256: h(JSON.stringify(input.totals)),
    },
    reportOnlyAward: {
      ordinal: 170,
      period: 2,
      second: 664,
      teamId: 21,
      committedByPlayerId: 8459094,
      type: "penalty-shot-award",
      penaltyMinutes: 0,
      originalRow: awards[0],
      nativeEventId: null,
      priceablePenalty: false,
    },
    ordinaryPenaltyIdentities: [
      {
        ordinal: 171,
        eventId: 11752681,
        typeCode: "MIS",
        duration: 10,
        offence: "misconduct",
      },
      {
        ordinal: 172,
        eventId: 11752682,
        typeCode: "GAM",
        duration: 10,
        offence: "game-misconduct",
      },
    ],
    originalNativePenalties: structuredClone(native),
    terminalPenaltyShotEventId: 11096795,
    terminalPenaltyShotOrdinal: 173,
    originalTerminalNative: structuredClone(nativeTerminal[0]),
    interpretation:
      "Report170 remains a distinct zero-minute award metadata record. No native event inserted/deleted, no PIM or penalty value added; only ordinary penalty171/172 identity matching is separated. Existing independently reconciled PS remains a single attempt.",
  };
}
