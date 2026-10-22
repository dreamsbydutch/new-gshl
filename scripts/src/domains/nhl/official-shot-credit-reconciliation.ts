import { createHash } from "node:crypto";
import { load } from "cheerio";
import type { HistoricalRawShot } from "./historical-shot-source-bridge";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid shot-credit source object");
  return value as Record<string, unknown>;
};
const list = (value: unknown): unknown[] => {
  if (!Array.isArray(value))
    throw Error("Invalid shot-credit source population");
  return value;
};
const integer = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw Error("Invalid shot-credit count/identity");
  return value;
};
const seconds = (value: unknown) => {
  if (typeof value !== "string" || !/^\d+:\d{2}$/.test(value))
    throw Error("Invalid shot-credit clock");
  const [m, s] = value.split(":").map(Number);
  if (s! >= 60) throw Error("Invalid shot-credit seconds");
  return m! * 60 + s!;
};
const normalized = (s: unknown) =>
  String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

/** Reviewed identities restrict this authority; the primary facts are replayed on every use. */
export const REVIEWED_SHOT_CREDIT_CASES = [
  [2009020961, 1108, 3, 1002, 8457981, 8471676, 252],
  [2009020329, 909, 4, 132, 8459514, 8473548, 351],
  [2009020709, 680, 3, 1152, 8465005, 8470610, 277],
  [2009020288, 561, 3, 182, 8467408, 8466378, 198],
  [2009021210, 635, 3, 1024, 8468434, 8470257, 283],
  [2009020070, 611, 3, 903, 8470625, 8470661, 252],
  [2009020074, 656, 3, 696, 8470966, 8470602, 285],
  [2009020683, 540, 3, 752, 8471241, 8459024, 256],
  [2009020732, 649, 3, 1199, 8471385, 8464981, 330],
  [2009020423, 1029, 3, 1087, 8474564, 8467338, 269],
] as const;

export type OfficialShotCreditSources = {
  rawPbpText: string;
  effectivePbp: unknown;
  playReportHtml: string;
  gameSummaryHtml: string;
  boxscoreText: string;
  providerRows: readonly HistoricalRawShot[];
  providerArchive: { url: string; sha256: string };
};

/** Actor correction only: no event removal, clock/geometry change, or model-derived input. */
export function reconcileOfficialShotCredits(input: OfficialShotCreditSources) {
  const raw = record(JSON.parse(input.rawPbpText)),
    effective = record(input.effectivePbp),
    box = record(JSON.parse(input.boxscoreText));
  const gameId = integer(effective.id),
    spec = REVIEWED_SHOT_CREDIT_CASES.find((c) => c[0] === gameId);
  if (
    !spec ||
    raw.id !== gameId ||
    box.id !== gameId ||
    raw.gameDate !== effective.gameDate ||
    box.gameDate !== effective.gameDate ||
    raw.gameType !== 2 ||
    effective.gameType !== 2 ||
    effective.gameState !== "OFF" ||
    input.providerArchive.url !==
      "https://peter-tanner.com/moneypuck/downloads/shots_2009.zip" ||
    !/^[a-f0-9]{64}$/.test(input.providerArchive.sha256)
  )
    throw Error("Unsupported reviewed shot-credit game/source scope");
  const roster = list(effective.rosterSpots).map(record),
    plays = list(effective.plays).map(record),
    rawPlays = list(raw.plays).map(record);
  const home = record(effective.homeTeam),
    away = record(effective.awayTeam);
  for (const side of ["homeTeam", "awayTeam"]) {
    const a = record(effective[side]),
      b = record(box[side]),
      r = record(raw[side]);
    if (
      a.id !== b.id ||
      a.id !== r.id ||
      a.abbrev !== b.abbrev ||
      a.abbrev !== r.abbrev ||
      a.score !== b.score
    )
      throw Error("Shot-credit official team identity/score differs");
  }
  if (
    new Set(roster.map((p) => integer(p.playerId))).size !== roster.length ||
    new Set(plays.map((p) => integer(p.eventId))).size !== plays.length
  )
    throw Error("Duplicate shot-credit roster/event identity");
  const day = String(effective.gameDate),
    date = new Date(day + "T12:00:00Z").toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  const parseReport = (html: string, title: string) => {
    const page = load(html),
      rows = page("tr")
        .toArray()
        .map((tr) =>
          page(tr)
            .children("td")
            .toArray()
            .map((td) => page(td).text().replace(/\s+/g, " ").trim()),
        );
    const cells = rows.flat();
    if (
      page("title").text().trim() !== title ||
      !cells.includes(date) ||
      !cells.some((c) =>
        new RegExp(`^(?:Match/)?Game\\s+0*${gameId % 10000}$`).test(c),
      )
    )
      throw Error("Wrong shot-credit primary report identity/date");
    return rows;
  };
  const rows = parseReport(input.playReportHtml, "Play By Play"),
    summaryRows = parseReport(input.gameSummaryHtml, "Game Summary");
  const summaryPage = load(input.gameSummaryHtml),
    logos = summaryPage("img")
      .toArray()
      .map(
        (img) =>
          summaryPage(img)
            .attr("src")
            ?.match(/logoc([a-z]+)\.gif/i)?.[1],
      )
      .filter((abbr) => abbr !== undefined && normalized(abbr) !== "NHL");
  const abbrKey = (value: unknown) =>
    (
      ({ NJD: "NJ", TBL: "TB", SJS: "SJ", LAK: "LA" }) as Record<string, string>
    )[normalized(value)] ?? normalized(value);
  if (
    logos.length !== 2 ||
    abbrKey(logos[0]) !== abbrKey(away.abbrev) ||
    abbrKey(logos[1]) !== abbrKey(home.abbrev)
  )
    throw Error("Shot-credit game summary teams differ");
  if (
    !summaryRows.some(
      (r) =>
        r.length === 3 &&
        Number(r[0]!.match(/^VISITOR\s+(\d+)\b/)?.[1]) === away.score &&
        Number(r[2]!.match(/^HOME\s+(\d+)\b/)?.[1]) === home.score,
    )
  )
    throw Error("Shot-credit game summary final scores differ");
  const summaryGoals = summaryRows
    .filter(
      (r) =>
        r.length === 10 &&
        /^\d+$/.test(r[0]!) &&
        (/^\d+$/.test(r[1]!) || r[1] === "OT") &&
        (r[1] === "OT" || Number(r[1]) <= 4),
    )
    .map((r) => {
      const team =
          abbrKey(r[4]) === abbrKey(home.abbrev)
            ? home.id
            : abbrKey(r[4]) === abbrKey(away.abbrev)
              ? away.id
              : null,
        label = r[5]!.match(/^(\d+)\s+(.+?)\(/);
      if (team === null || !label)
        throw Error("Invalid shot-credit game summary scorer");
      const matches = roster.filter(
        (p) =>
          p.teamId === team &&
          p.sweaterNumber === Number(label[1]) &&
          normalized(label[2]).endsWith(normalized(record(p.lastName).default)),
      );
      if (matches.length !== 1)
        throw Error("Game summary scorer identity differs");
      return {
        team,
        playerId: matches[0]!.playerId,
        period: r[1] === "OT" ? 4 : Number(r[1]),
        second: seconds(r[2]),
      };
    });
  const nativeGoals = plays.filter(
    (p) =>
      record(p.periodDescriptor).periodType !== "SO" &&
      p.typeDescKey === "goal",
  );
  if (
    nativeGoals.length !== summaryGoals.length ||
    nativeGoals.some(
      (p) =>
        summaryGoals.filter(
          (g) =>
            g.team === record(p.details).eventOwnerTeamId &&
            g.playerId === record(p.details).scoringPlayerId &&
            g.period === record(p.periodDescriptor).number &&
            g.second === seconds(p.timeInPeriod),
        ).length !== 1,
    )
  )
    throw Error("Game summary full scoring ledger differs");
  const candidates = plays.filter((p) => p.eventId === spec[1]),
    originals = rawPlays.filter((p) => p.eventId === spec[1]);
  if (candidates.length !== 1 || originals.length !== 1)
    throw Error("Missing reviewed shot-credit native event");
  const event = candidates[0]!,
    details = record(event.details),
    original = originals[0]!;
  if (
    event.typeDescKey !== "shot-on-goal" ||
    record(event.periodDescriptor).number !== spec[2] ||
    seconds(event.timeInPeriod) !== spec[3] ||
    details.shootingPlayerId !== spec[4] ||
    original.typeDescKey !== event.typeDescKey ||
    record(original.periodDescriptor).number !== spec[2] ||
    seconds(original.timeInPeriod) !== spec[3] ||
    record(original.details).shootingPlayerId !== spec[4]
  )
    throw Error("Reviewed shot-credit original/effective facts changed");
  const matching = rows.filter(
    (r) =>
      r.length === 8 &&
      r[4] === "SHOT" &&
      Number(r[1]) === spec[2] &&
      seconds(r[3]!.match(/^\d+:\d{2}/)?.[0]) === spec[3],
  );
  if (matching.length !== 1 || Number(matching[0]![0]) !== spec[6])
    throw Error("Shot-credit primary event is not unique");
  const row = matching[0]!,
    label = row[5]!.match(/^([A-Z.]+) ONGOAL - #(\d+)\s+([^,]+),/);
  if (!label) throw Error("Invalid shot-credit primary actor label");
  const abbr = normalized(label[1]),
    team =
      abbr === normalized(home.abbrev)
        ? home.id
        : abbr === normalized(away.abbrev)
          ? away.id
          : ({ NJ: 1, TB: 14, SJ: 28 } as Record<string, number>)[abbr];
  const actor = roster.filter(
    (p) =>
      p.teamId === team &&
      p.sweaterNumber === Number(label[2]) &&
      p.positionCode !== "G" &&
      normalized(record(p.lastName).default) === normalized(label[3]),
  );
  if (
    actor.length !== 1 ||
    actor[0]!.playerId !== spec[5] ||
    team !== details.eventOwnerTeamId ||
    roster.filter((p) => p.playerId === spec[4] && p.teamId === team).length !==
      1
  )
    throw Error("Shot-credit primary team/jersey/name/identity differs");
  const provider = input.providerRows.filter(
    (r) => r.gameId === gameId && r.ordinal === spec[6],
  );
  if (provider.length !== 1)
    throw Error("Missing/duplicate shot-credit raw archive event");
  const mp = provider[0]!;
  if (
    mp.kind !== "SHOT" ||
    mp.period !== spec[2] ||
    mp.second !== spec[3] ||
    mp.shooter !== spec[5] ||
    mp.home !== (team === home.id) ||
    mp.goalie !== details.goalieInNetId ||
    !Number.isFinite(mp.x) ||
    !Number.isFinite(mp.y) ||
    Math.abs(mp.x) > 100 ||
    Math.abs(mp.y) > 43
  )
    throw Error("Shot-credit raw archive/primary/native identity differs");
  const onIce = (text: string, side: unknown) => {
    const tokens = [...text.matchAll(/(\d+)\s+([CLRDG])\b/g)],
      ids = tokens.map((t) => {
        const matches = roster.filter(
          (p) =>
            p.teamId === side &&
            p.sweaterNumber === Number(t[1]) &&
            (p.positionCode === "G") === (t[2] === "G"),
        );
        if (matches.length !== 1)
          throw Error("Shot-credit primary on-ice identity differs");
        return matches[0]!;
      });
    if (new Set(ids.map((p) => p.playerId)).size !== ids.length)
      throw Error("Duplicate shot-credit primary on-ice identity");
    return ids;
  };
  const homeIce = onIce(row[7]!, home.id),
    awayIce = onIce(row[6]!, away.id),
    ownIce = team === home.id ? homeIce : awayIce,
    opposingIce = team === home.id ? awayIce : homeIce;
  if (
    !ownIce.some((p) => p.playerId === spec[5]) ||
    opposingIce.filter((p) => p.positionCode === "G").length !== 1 ||
    !opposingIce.some(
      (p) => p.playerId === mp.goalie && p.positionCode === "G",
    ) ||
    homeIce.filter((p) => p.positionCode !== "G").length !== mp.homeSkaters ||
    awayIce.filter((p) => p.positionCode !== "G").length !== mp.awaySkaters ||
    homeIce.some((p) => p.positionCode === "G") !== mp.homeGoalie ||
    awayIce.some((p) => p.positionCode === "G") !== mp.awayGoalie
  )
    throw Error("Shot-credit archive/primary lineup or manpower differs");
  const output = structuredClone(effective),
    next = list(output.plays)
      .map(record)
      .find((p) => p.eventId === spec[1])!;
  record(next.details).shootingPlayerId = spec[5];
  const counts: Array<Record<string, unknown>> = [],
    boxIds = new Set<number>(),
    boxIdentities = new Map<number, { teamId: unknown; goalie: boolean }>(),
    onGoal = list(output.plays)
      .map(record)
      .filter(
        (p) =>
          record(p.periodDescriptor).periodType !== "SO" &&
          ["goal", "shot-on-goal"].includes(String(p.typeDescKey)),
      );
  for (const [side, teamId] of [
    ["homeTeam", home.id],
    ["awayTeam", away.id],
  ] as const) {
    const stats = record(record(box.playerByGameStats)[side]),
      teamBox = record(box[side]),
      own = onGoal.filter((p) => record(p.details).eventOwnerTeamId === teamId);
    if (
      own.length !== integer(teamBox.sog) ||
      own.filter((p) => p.typeDescKey === "goal").length !==
        summaryGoals.filter((g) => g.team === teamId).length
    )
      throw Error("Shot-credit whole team SOG/goal conservation failed");
    for (const group of ["forwards", "defense", "goalies"]) {
      for (const p of list(stats[group]).map(record)) {
        const id = integer(p.playerId),
          goalie = group === "goalies";
        if (
          id === 0 ||
          boxIds.has(id) ||
          roster.filter(
            (r) =>
              r.playerId === id &&
              r.teamId === teamId &&
              (r.positionCode === "G") === goalie,
          ).length !== 1
        )
          throw Error("Shot-credit official box identity/role differs");
        boxIds.add(id);
        boxIdentities.set(id, { teamId, goalie });
        const mine = onGoal.filter((e) => {
          const d = record(e.details);
          return goalie
            ? d.goalieInNetId === id
            : Number(d.shootingPlayerId ?? d.scoringPlayerId) === id;
        });
        const official = integer(goalie ? p.shotsAgainst : p.sog),
          goals = integer(goalie ? p.goalsAgainst : p.goals);
        if (
          mine.length !== official ||
          mine.filter((e) => e.typeDescKey === "goal").length !== goals
        )
          throw Error(
            "Shot-credit complete player SOG/SA/goal conservation failed",
          );
        counts.push({
          playerId: id,
          goalie,
          officialOnGoal: official,
          reconciledSourceOnGoal: mine.length,
          officialGoals: goals,
        });
      }
    }
  }
  if (
    onGoal.some((p) => {
      const d = record(p.details);
      const shooter = boxIdentities.get(
          Number(d.shootingPlayerId ?? d.scoringPlayerId),
        ),
        goalie = boxIdentities.get(Number(d.goalieInNetId)),
        owner = d.eventOwnerTeamId;
      return (
        !shooter ||
        shooter.teamId !== owner ||
        (Number(d.goalieInNetId) > 0 &&
          (!goalie || !goalie.goalie || goalie.teamId === owner))
      );
    })
  )
    throw Error("Shot-credit event outside complete official box population");
  return {
    pbp: output,
    proof: {
      version: "nhl-official-shot-credit-reconciliation-v1" as const,
      gameId,
      date: day,
      originalRawPbpSha256: sha(input.rawPbpText),
      preOverlayEffectivePbpSha256: sha(JSON.stringify(effective)),
      outputSha256: sha(JSON.stringify(output)),
      officialPlayReportSha256: sha(input.playReportHtml),
      officialGameSummarySha256: sha(input.gameSummaryHtml),
      officialBoxSha256: sha(input.boxscoreText),
      providerArchive: { ...input.providerArchive },
      sourceUrls: {
        rawPbp: `https://api-web.nhle.com/v1/gamecenter/${gameId}/play-by-play`,
        playReport: `https://www.nhl.com/scores/htmlreports/20092010/PL${String(gameId % 1000000).padStart(6, "0")}.HTM`,
        gameSummary: `https://www.nhl.com/scores/htmlreports/20092010/GS${String(gameId % 1000000).padStart(6, "0")}.HTM`,
        boxscore: `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`,
      },
      corrections: [
        {
          eventId: spec[1],
          period: spec[2],
          second: spec[3],
          reportOrdinal: spec[6],
          fromPlayerId: spec[4],
          toPlayerId: spec[5],
          geometry: {
            nativeX: details.xCoord ?? null,
            nativeY: details.yCoord ?? null,
            providerX: mp.x,
            providerY: mp.y,
            agrees: mp.x === details.xCoord && mp.y === details.yCoord,
            policy:
              "Native geometry preserved exactly; no provider geometry substitution or new probability",
          },
        },
      ],
      counts,
      interpretation:
        "Only the uniquely primary-report/roster/raw-archive-confirmed shooting identity changes. Every event, clock, geometry, goalie, goal and unrelated native fact remains intact; entire official team/player SOG, SA and goal populations reconcile. No provider probabilities.",
    },
  };
}
