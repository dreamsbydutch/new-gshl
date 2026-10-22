import { load } from "cheerio";

type Team = { id: number; abbrev: string; score: number };
type RosterPlayer = {
  playerId: number;
  teamId: number;
  sweaterNumber: number;
  positionCode: string;
  lastName: { default: string };
};
type Play = {
  eventId: number;
  typeDescKey: string;
  periodDescriptor: { number: number; periodType: string };
  timeInPeriod: string;
  situationCode: string;
  details?: Record<string, unknown>;
};
type Game = {
  id: number;
  gameDate: string;
  homeTeam: Team;
  awayTeam: Team;
  rosterSpots: RosterPlayer[];
  plays: Play[];
};
export type OfficialEmptyNetCorrection = {
  eventId: number;
  period: number;
  timeInPeriod: string;
  shooterId: number;
  shootingTeamId: number;
  originalSituation: string;
  correctedSituation: string;
  awayPlayers: number[];
  homePlayers: number[];
};
export type OfficialEmptyNetSupplement = {
  version: "nhl-official-empty-net-corrections-v1";
  gameId: number;
  pbpSha256: string;
  htmlSha256: string;
  boxSha256: string;
  corrections: OfficialEmptyNetCorrection[];
};
const normalized = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const hash = (value: string) => /^[a-f0-9]{64}$/.test(value);

/** Validate the exact raw feed and roster identities before applying a separately reviewed source correction. */
export function applyOfficialEmptyNetSupplement<T>(
  raw: T,
  rawSha256: string,
  supplement: OfficialEmptyNetSupplement,
): T {
  const game = raw as Game;
  if (
    supplement.version !== "nhl-official-empty-net-corrections-v1" ||
    supplement.gameId !== game.id ||
    supplement.pbpSha256 !== rawSha256 ||
    ![rawSha256, supplement.htmlSha256, supplement.boxSha256].every(hash) ||
    !Array.isArray(supplement.corrections) ||
    !supplement.corrections.length ||
    new Set(supplement.corrections.map((c) => c.eventId)).size !==
      supplement.corrections.length
  )
    throw new Error("Invalid official empty-net supplement scope/hash");
  const roster = new Map(game.rosterSpots.map((p) => [p.playerId, p]));
  if (roster.size !== game.rosterSpots.length)
    throw Error("Duplicate official empty-net roster identity");
  const replacements = new Map<number, string>();
  for (const correction of supplement.corrections) {
    const events = game.plays.filter((p) => p.eventId === correction.eventId);
    const event = events[0],
      home = correction.shootingTeamId === game.homeTeam.id;
    if (
      events.length !== 1 ||
      !event ||
      event.typeDescKey !== "goal" ||
      event.periodDescriptor.periodType === "SO" ||
      event.periodDescriptor.number !== correction.period ||
      event.timeInPeriod !== correction.timeInPeriod ||
      event.situationCode !== correction.originalSituation ||
      event.details?.scoringPlayerId !== correction.shooterId ||
      event.details?.eventOwnerTeamId !== correction.shootingTeamId ||
      (event.details?.goalieInNetId !== undefined &&
        event.details.goalieInNetId !== null) ||
      ![game.homeTeam.id, game.awayTeam.id].includes(
        correction.shootingTeamId,
      ) ||
      !/^\d{4}$/.test(correction.originalSituation)
    )
      throw new Error("Official empty-net event identity changed");
    const codes = [];
    for (const [team, ids] of [
      [game.awayTeam.id, correction.awayPlayers],
      [game.homeTeam.id, correction.homePlayers],
    ] as const) {
      if (
        !Array.isArray(ids) ||
        new Set(ids).size !== ids.length ||
        ids.length < 4 ||
        ids.length > 6 ||
        ids.some(
          (id) => !Number.isSafeInteger(id) || roster.get(id)?.teamId !== team,
        )
      )
        throw new Error("Invalid official empty-net lineup identity");
      const goalies = ids.filter(
        (id) => roster.get(id)?.positionCode === "G",
      ).length;
      if (goalies > 1)
        throw new Error("Invalid official empty-net goalie count");
      codes.push(String(goalies), String(ids.length - goalies));
    }
    const code = codes[0]! + codes[1]! + codes[3]! + codes[2]!;
    const own = home ? correction.homePlayers : correction.awayPlayers;
    const defendingGoalie = home ? code[0] : code[3];
    const ownGoalieIndex = home ? 3 : 0,
      ownSkaterIndex = home ? 2 : 1,
      defendingSkaterIndex = home ? 1 : 2;
    if (
      code !== correction.correctedSituation ||
      code === correction.originalSituation ||
      (home
        ? correction.originalSituation[0]
        : correction.originalSituation[3]) !== "1" ||
      defendingGoalie !== "0" ||
      Number(code[ownSkaterIndex]) < 3 ||
      Number(code[ownSkaterIndex]) > 5 ||
      correction.originalSituation[ownGoalieIndex] !== code[ownGoalieIndex] ||
      correction.originalSituation[ownSkaterIndex] !== code[ownSkaterIndex] ||
      Number(correction.originalSituation[defendingSkaterIndex]) < 3 ||
      Number(correction.originalSituation[defendingSkaterIndex]) > 5 ||
      Number(code[defendingSkaterIndex]) !==
        Number(correction.originalSituation[defendingSkaterIndex]) + 1 ||
      !own.includes(correction.shooterId) ||
      roster.get(correction.shooterId)?.positionCode === "G" ||
      (home ? code[3] : code[0]) !== "1"
    )
      throw new Error(
        "Official empty-net correction does not identify an empty defending net",
      );
    replacements.set(correction.eventId, code);
  }
  return {
    ...game,
    plays: game.plays.map((p) =>
      replacements.has(p.eventId)
        ? { ...p, situationCode: replacements.get(p.eventId)! }
        : p,
    ),
  } as T;
}

/** An explicit, unique report lineup plus independent game-level goalie accounting; never infer empty net from absent goalieInNetId alone. */
export function parseOfficialEmptyNetCorrections(
  html: string,
  raw: unknown,
  boxRaw: unknown,
  eventIds: number[],
  hashes: { pbpSha256: string; htmlSha256: string; boxSha256: string },
): OfficialEmptyNetSupplement {
  const game = raw as Game;
  const box = boxRaw as {
    id: number;
    gameDate: string;
    homeTeam: Team;
    awayTeam: Team;
    playerByGameStats: Record<
      "homeTeam" | "awayTeam",
      {
        goalies: Array<{
          playerId: number;
          goalsAgainst: number;
          shotsAgainst?: number;
        }>;
      }
    >;
  };
  const page = load(html),
    cells = page("td")
      .toArray()
      .map((td) => page(td).text().replace(/\s+/g, " ").trim());
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(game.gameDate + "T00:00:00Z"));
  if (
    !/Play By Play/i.test(page("title").text()) ||
    !cells.includes(date) ||
    !cells.some(
      (c) =>
        /^Game\s+\d+$/.test(c) &&
        Number(c.match(/\d+/)![0]) === game.id % 10000,
    ) ||
    box.id !== game.id ||
    box.gameDate !== game.gameDate ||
    box.homeTeam.id !== game.homeTeam.id ||
    box.awayTeam.id !== game.awayTeam.id ||
    box.homeTeam.score !== game.homeTeam.score ||
    box.awayTeam.score !== game.awayTeam.score ||
    !eventIds.length ||
    new Set(eventIds).size !== eventIds.length
  )
    throw new Error("Wrong official empty-net report scope");
  const corrections: OfficialEmptyNetCorrection[] = [];
  for (const eventId of eventIds) {
    const events = game.plays.filter((p) => p.eventId === eventId),
      event = events[0];
    if (
      events.length !== 1 ||
      !event ||
      event.typeDescKey !== "goal" ||
      event.periodDescriptor.periodType === "SO"
    )
      throw new Error("Ambiguous official empty-net event");
    const team = Number(event.details?.eventOwnerTeamId),
      shooter = Number(event.details?.scoringPlayerId),
      home = team === game.homeTeam.id;
    const player = game.rosterSpots.find(
      (p) => p.playerId === shooter && p.teamId === team,
    );
    if (!player) throw new Error("Unknown official empty-net shooter");
    const matches: OfficialEmptyNetCorrection[] = [];
    page("tr").each((_, tr) => {
      const columns = page(tr).children("td");
      if (
        columns.length !== 8 ||
        Number(page(columns[1]).text().trim()) !==
          event.periodDescriptor.number ||
        page(columns[4]).text().trim() !== "GOAL"
      )
        return;
      const clock = page(columns[3])
        .html()
        ?.split(/<br\s*\/?\s*>/i)[0]
        ?.replace(/<[^>]*>/g, "")
        .trim();
      const description = page(columns[5]).text().replace(/\s+/g, " ").trim();
      const abbrev = home ? game.homeTeam.abbrev : game.awayTeam.abbrev;
      if (
        clock !== event.timeInPeriod ||
        !description.startsWith(`${abbrev} #${player.sweaterNumber} `) ||
        !normalized(description.split("(")[0]!).endsWith(
          normalized(player.lastName.default),
        )
      )
        return;
      const lineups: number[][] = [];
      for (const [index, teamId] of [
        [6, game.awayTeam.id],
        [7, game.homeTeam.id],
      ]) {
        const ids: number[] = [];
        page(columns[index!])
          .find("font[title]")
          .each((__, font) => {
            const jersey = Number(page(font).text().trim()),
              title = String(page(font).attr("title"));
            const roster = game.rosterSpots.filter(
              (p) =>
                p.teamId === teamId &&
                p.sweaterNumber === jersey &&
                normalized(title).endsWith(normalized(p.lastName.default)) &&
                /^Goalie\s*-/.test(title) === (p.positionCode === "G"),
            );
            if (roster.length !== 1)
              throw new Error("Ambiguous official empty-net report player");
            ids.push(roster[0]!.playerId);
          });
        lineups.push(ids);
      }
      const [awayPlayers, homePlayers] = lineups as [number[], number[]];
      if (lineups.some((ids) => ids.length !== 6)) {
        for (const [side, index, teamId] of [
          [0, 6, game.awayTeam.id],
          [1, 7, game.homeTeam.id],
        ] as const) {
          const text = page(columns[index]).text().replace(/\s+/g, " ").trim(),
            token = /(\d+)\s*([CLRDG])(?=\s|\d|$)/g,
            printed = [...text.matchAll(token)],
            ids = printed.map((item) => {
              const players = game.rosterSpots.filter(
                (p) =>
                  p.teamId === teamId &&
                  p.sweaterNumber === Number(item[1]) &&
                  (p.positionCode === "G") === (item[2] === "G"),
              );
              if (players.length !== 1)
                throw Error("Unknown short-handed printed lineup identity");
              return players[0]!.playerId;
            });
          if (
            text.replace(token, "").trim() ||
            JSON.stringify(ids) !== JSON.stringify(lineups[side])
          )
            throw Error("Incomplete short-handed official lineup metadata");
        }
      }
      const ac = awayPlayers.filter(
          (id) =>
            game.rosterSpots.find((p) => p.playerId === id)!.positionCode ===
            "G",
        ).length,
        hc = homePlayers.filter(
          (id) =>
            game.rosterSpots.find((p) => p.playerId === id)!.positionCode ===
            "G",
        ).length;
      matches.push({
        eventId,
        period: event.periodDescriptor.number,
        timeInPeriod: event.timeInPeriod,
        shooterId: shooter,
        shootingTeamId: team,
        originalSituation: event.situationCode,
        correctedSituation: `${ac}${awayPlayers.length - ac}${homePlayers.length - hc}${hc}`,
        awayPlayers,
        homePlayers,
      });
    });
    if (matches.length !== 1)
      throw new Error("Ambiguous official empty-net report match");
    corrections.push(matches[0]!);
  }
  const supplement: OfficialEmptyNetSupplement = {
    version: "nhl-official-empty-net-corrections-v1",
    gameId: game.id,
    ...hashes,
    corrections,
  };
  const corrected = applyOfficialEmptyNetSupplement(
    game,
    hashes.pbpSha256,
    supplement,
  );
  for (const side of ["homeTeam", "awayTeam"] as const) {
    const opposing = side === "homeTeam" ? game.awayTeam : game.homeTeam,
      goalieStats = box.playerByGameStats[side].goalies;
    const goals = corrected.plays.filter(
      (p) =>
        p.typeDescKey === "goal" &&
        p.periodDescriptor.periodType !== "SO" &&
        p.details?.eventOwnerTeamId === opposing.id,
    );
    const actual = new Map<number, number>();
    let empty = 0;
    for (const goal of goals) {
      const id = Number(goal.details?.goalieInNetId);
      if (id) {
        if (!goalieStats.some((g) => g.playerId === id))
          throw new Error("Unknown official scored-on goalie");
        actual.set(id, (actual.get(id) ?? 0) + 1);
      } else {
        const code = goal.situationCode;
        if ((side === "homeTeam" ? code[3] : code[0]) !== "0")
          throw new Error("Unresolved official scored-on goalie");
        empty++;
      }
    }
    if (
      goalieStats.some(
        (g) =>
          !Number.isInteger(g.goalsAgainst) ||
          g.goalsAgainst < 0 ||
          (actual.get(g.playerId) ?? 0) !== g.goalsAgainst,
      ) ||
      goals.length !==
        opposing.score -
          (game.plays.some((p) => p.periodDescriptor.periodType === "SO") &&
          opposing.score > game[side].score
            ? 1
            : 0) ||
      empty !==
        goals.length - goalieStats.reduce((sum, g) => sum + g.goalsAgainst, 0)
    )
      throw new Error("Official empty-net goal/box accounting mismatch");
  }
  // Existing six-player certificates keep their exact serialized body and
  // validation policy. The newly supported short-handed class additionally
  // requires complete independent SA accounting, not absent goalie IDs alone.
  if (
    corrections.some(
      (c) => c.awayPlayers.length !== 6 || c.homePlayers.length !== 6,
    )
  ) {
    const actual = new Map<number, number>();
    for (const event of corrected.plays.filter(
      (p) =>
        p.periodDescriptor.periodType !== "SO" &&
        ["shot-on-goal", "goal"].includes(p.typeDescKey),
    )) {
      const owner = Number(event.details?.eventOwnerTeamId),
        goalie = event.details?.goalieInNetId;
      if (![game.homeTeam.id, game.awayTeam.id].includes(owner))
        throw Error("Unknown short-handed empty-net physical owner");
      const home = owner === game.homeTeam.id;
      if (goalie === undefined || goalie === null) {
        if (event.situationCode?.[home ? 0 : 3] !== "0")
          throw Error("Unknown short-handed empty-net physical goalie");
        continue;
      }
      const player = game.rosterSpots.filter((p) => p.playerId === goalie);
      if (
        player.length !== 1 ||
        player[0]!.positionCode !== "G" ||
        player[0]!.teamId === owner
      )
        throw Error("Invalid short-handed empty-net physical goalie");
      actual.set(Number(goalie), (actual.get(Number(goalie)) ?? 0) + 1);
    }
    const seen = new Set<number>();
    for (const side of ["homeTeam", "awayTeam"] as const)
      for (const goalie of box.playerByGameStats[side].goalies) {
        const roster = game.rosterSpots.filter(
          (p) => p.playerId === goalie.playerId,
        );
        if (
          !Number.isSafeInteger(goalie.playerId) ||
          seen.has(goalie.playerId) ||
          roster.length !== 1 ||
          roster[0]!.positionCode !== "G" ||
          roster[0]!.teamId !== game[side].id ||
          !Number.isSafeInteger(goalie.shotsAgainst) ||
          Number(goalie.shotsAgainst) < 0 ||
          (actual.get(goalie.playerId) ?? 0) !== goalie.shotsAgainst
        )
          throw Error("Short-handed empty-net complete goalie SA differs");
        seen.add(goalie.playerId);
      }
    if ([...actual.keys()].some((id) => !seen.has(id)))
      throw Error("Short-handed empty-net physical goalie absent from box");
  }
  return supplement;
}
