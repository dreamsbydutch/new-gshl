import { createHash } from "node:crypto";
import { load } from "cheerio";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Explicit reviewed source reconstruction. Only source fields missing from PL299 are supplied. */
export function verifyGs0868Supplement(input: {
  rawPbpText: string;
  primaryHtml: string;
  summaryHtml: string;
}) {
  const raw = JSON.parse(input.rawPbpText);
  if (
    raw.id !== 2008020868 ||
    raw.season !== 20082009 ||
    raw.gameType !== 2 ||
    raw.gameDate !== "2009-02-19" ||
    raw.awayTeam?.id !== 22 ||
    raw.awayTeam?.abbrev !== "EDM" ||
    raw.homeTeam?.id !== 25 ||
    raw.homeTeam?.abbrev !== "DAL"
  )
    throw Error("Wrong reviewed GS0868 native scope");
  const actors = raw.rosterSpots.filter((p: any) => p.playerId === 8460504);
  if (
    actors.length !== 1 ||
    actors[0].teamId !== 22 ||
    actors[0].sweaterNumber !== 18 ||
    actors[0].firstName?.default !== "Ethan" ||
    actors[0].lastName?.default !== "Moreau"
  )
    throw Error("Wrong reviewed Moreau identity");
  if (
    raw.rosterSpots.filter(
      (p: any) => p.teamId === 22 && p.sweaterNumber === 18,
    ).length !== 1
  )
    throw Error("Ambiguous reviewed Moreau jersey");
  const drawn = raw.rosterSpots.filter(
    (p: any) => p.teamId === 25 && p.sweaterNumber === 29,
  );
  if (
    drawn.length !== 1 ||
    drawn[0].playerId !== 8468505 ||
    drawn[0].lastName?.default !== "Ott"
  )
    throw Error("Wrong primary drawn-by roster identity");
  const parse = (html: string, title: string) => {
    const page = load(html),
      cells = page("td")
        .toArray()
        .map((td) => page(td).text().replace(/\s+/g, " ").trim());
    if (
      page("title").text().trim() !== title ||
      !cells.includes("Game 0868") ||
      !cells.includes("Thursday, February 19, 2009")
    )
      throw Error("Wrong reviewed report scope");
    return page;
  };
  const pl = parse(input.primaryHtml, "Play By Play"),
    gs = parse(input.summaryHtml, "Game Summary");
  const primaryRows = pl("tr")
    .toArray()
    .map((tr) =>
      pl(tr)
        .children("td")
        .toArray()
        .map((td) => pl(td).text().replace(/\s+/g, " ").trim()),
    );
  const missing = primaryRows.filter((r) => r.length === 8 && r[0] === "299");
  if (
    missing.length !== 1 ||
    !same(missing[0].slice(0, 6), [
      "299",
      "3",
      "PP",
      "14:535:07",
      "PENL",
      "EDM #18 MOREAU ( min) Drawn By: DAL #29 OTT",
    ])
  )
    throw Error("Primary299 is not the reviewed missing-field record");
  const summaryRows = gs("#PenaltySummary tr")
    .toArray()
    .map((tr) =>
      gs(tr)
        .children("td")
        .toArray()
        .map((td) => gs(td).text().replace(/\s+/g, " ").trim()),
    )
    .filter(
      (r) =>
        r.length === 6 &&
        r[1] === "3" &&
        r[2] === "14:53" &&
        r[3] === "18 E.MOREAU",
    );
  const expected = [
    ["8", "3", "14:53", "18 E.MOREAU", "2", "Instigator"],
    ["13", "3", "14:53", "18 E.MOREAU", "5", "Fighting (maj)"],
    ["14", "3", "14:53", "18 E.MOREAU", "10", "Misconduct (10 min)"],
  ];
  if (!same(summaryRows, expected))
    throw Error("GS0868 full three-penalty conservation failed");
  const native = raw.plays.filter(
    (p: any) =>
      p.typeDescKey === "penalty" &&
      p.periodDescriptor?.number === 3 &&
      p.timeInPeriod === "14:53" &&
      p.details?.committedByPlayerId === 8460504,
  );
  if (
    !same(
      native.map((p: any) => [
        p.eventId,
        p.details.eventOwnerTeamId,
        p.details.typeCode,
        p.details.duration,
        p.details.descKey,
      ]),
      [
        [11750000, 22, "MIN", 2, "instigator"],
        [11750001, 22, "MAJ", 5, "fighting"],
        [11750002, 22, "MIS", 10, "misconduct"],
      ],
    )
  )
    throw Error("Native full three-penalty conservation failed");
  if (
    native[0].details.drawnByPlayerId !== 8468505 ||
    native[1].details.drawnByPlayerId !== 8468505
  )
    throw Error("Native/primary drawn-by identity differs");
  return {
    version: "nhl-reviewed-gs0868-penalty-fields-v1",
    gameId: raw.id,
    sourceHashes: {
      rawPbpSha256: sha(input.rawPbpText),
      primaryReportSha256: sha(input.primaryHtml),
      summarySha256: sha(input.summaryHtml),
    },
    supplementalPenalty: {
      ordinal: 299,
      period: 3,
      second: 893,
      teamId: 22,
      committedByPlayerId: 8460504,
      typeCode: "MIN",
      duration: 2,
      offence: "Instigator",
    },
    originalPrimaryRow: missing[0],
    summaryRows,
    originalNativePenalties: native,
    interpretation:
      "Only malformed PL299 fields independently supplied by exact GS rows; original raw records and PL text remain unchanged. Not a PIM-total inference.",
  };
}
