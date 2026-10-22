import { createHash } from "node:crypto";
import { load } from "cheerio";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const name = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
const clock = (s: string) =>
  s.split(":").reduce((a, b) => a * 60 + Number(b), 0);
type Scope = {
  date: string;
  period: number;
  second: number;
  owner: number;
  reportTeam: string;
  shooter: number;
  goalie: number;
  ids: number[];
  ordinals: number[];
  types: string[];
  ordinaryCounts: number[];
};
const scopes: Record<number, Scope> = {
  2008020727: {
    date: "2009-01-30",
    period: 3,
    second: 303,
    owner: 14,
    reportTeam: "T.B",
    shooter: 8466378,
    goalie: 8467511,
    ids: [11073100, 11073101],
    ordinals: [251, 252],
    types: ["wrist", "wrist"],
    ordinaryCounts: [4, 5],
  },
  2008020935: {
    date: "2009-03-01",
    period: 1,
    second: 220,
    owner: 13,
    reportTeam: "FLA",
    shooter: 8471266,
    goalie: 8460535,
    ids: [11085884, 11085885],
    ordinals: [27, 28],
    types: ["backhand", "snap"],
    ordinaryCounts: [5, 4],
  },
  2008021166: {
    date: "2009-04-04",
    period: 2,
    second: 391,
    owner: 8,
    reportTeam: "MTL",
    shooter: 8471670,
    goalie: 8469675,
    ids: [11099957, 11099958],
    ordinals: [153, 155],
    types: ["snap", "wrist"],
    ordinaryCounts: [1, 5],
  },
};
export type PairedPsSourceInput = {
  rawPbpText: string;
  primaryHtml: string;
  freshBoxText: string;
  officialAppearanceBoxText: string;
  totals: Array<{
    gameId: number;
    playerId: number;
    penaltyShotAttempts: number;
    penaltyShotsGoals: number;
  }>;
};

/** Source-only reviewed reconstruction. No fitted model, probability, or source writes. */
export function verifyPairedPsSource(input: PairedPsSourceInput) {
  const raw = JSON.parse(input.rawPbpText),
    box = JSON.parse(input.freshBoxText),
    scope = scopes[raw.id];
  if (
    !scope ||
    raw.season !== 20082009 ||
    raw.gameType !== 2 ||
    raw.gameDate !== scope.date ||
    box.id !== raw.id ||
    box.season !== 20082009 ||
    box.gameType !== 2 ||
    box.gameDate !== scope.date ||
    box.homeTeam?.id !== raw.homeTeam?.id ||
    box.awayTeam?.id !== raw.awayTeam?.id ||
    ![raw.homeTeam.id, raw.awayTeam.id].includes(scope.owner) ||
    raw.homeTeam.id === raw.awayTeam.id
  )
    throw Error("Wrong paired-PS game/source scope");
  if (
    input.totals.length !== 1 ||
    input.totals[0].gameId !== raw.id ||
    input.totals[0].playerId !== scope.shooter ||
    input.totals[0].penaltyShotAttempts !== 1 ||
    input.totals[0].penaltyShotsGoals !== 0
  )
    throw Error("Paired-PS official ledger differs");
  if (
    new Set(raw.plays.map((p: any) => p.eventId)).size !== raw.plays.length ||
    new Set(raw.rosterSpots.map((p: any) => p.playerId)).size !==
      raw.rosterSpots.length
  )
    throw Error("Duplicate native identity");
  if (
    new Set(raw.rosterSpots.map((p: any) => `${p.teamId}:${p.sweaterNumber}`))
      .size !== raw.rosterSpots.length ||
    raw.rosterSpots.some(
      (p: any) =>
        !Number.isSafeInteger(p.playerId) ||
        p.playerId <= 0 ||
        !Number.isSafeInteger(p.sweaterNumber) ||
        p.sweaterNumber < 1 ||
        ![raw.homeTeam.id, raw.awayTeam.id].includes(p.teamId),
    )
  )
    throw Error("Invalid/duplicate full native roster identity");
  for (const p of raw.plays) {
    const period = p.periodDescriptor?.number,
      type = p.periodDescriptor?.periodType;
    if (
      !Number.isSafeInteger(p.eventId) ||
      p.eventId <= 0 ||
      !Number.isSafeInteger(p.sortOrder) ||
      p.sortOrder < 0 ||
      !Number.isSafeInteger(period) ||
      !/^\d+:[0-5]\d$/.test(p.timeInPeriod ?? "") ||
      !(
        (type === "REG" &&
          period >= 1 &&
          period <= 3 &&
          clock(p.timeInPeriod) <= 1200) ||
        (type === "OT" && period === 4 && clock(p.timeInPeriod) <= 300) ||
        (type === "SO" && period >= 5 && clock(p.timeInPeriod) === 0)
      )
    )
      throw Error("Invalid full native event identity/clock/period");
    if (type !== "SO" && ["shot-on-goal", "goal"].includes(p.typeDescKey)) {
      if (
        p.typeDescKey === "goal" &&
        p.details?.shootingPlayerId !== undefined &&
        p.details?.scoringPlayerId !== undefined &&
        p.details.shootingPlayerId !== p.details.scoringPlayerId
      )
        throw Error("Contradictory native goal shooter/scorer identity");
      const owner = p.details?.eventOwnerTeamId,
        actorId = p.details?.shootingPlayerId ?? p.details?.scoringPlayerId,
        actor = raw.rosterSpots.find((r: any) => r.playerId === actorId),
        goalieId = p.details?.goalieInNetId;
      if (
        ![raw.homeTeam.id, raw.awayTeam.id].includes(owner) ||
        !Number.isSafeInteger(actorId) ||
        !actor ||
        actor.teamId !== owner
      )
        throw Error("Whole native on-goal owner/shooter identity differs");
      if (goalieId !== undefined && goalieId !== null && goalieId !== 0) {
        const keeper = raw.rosterSpots.find(
          (r: any) => r.playerId === goalieId,
        );
        if (
          !Number.isSafeInteger(goalieId) ||
          !keeper ||
          keeper.positionCode !== "G" ||
          keeper.teamId === owner
        )
          throw Error("Whole native on-goal opposing goalie differs");
      }
    }
  }
  const shooter = raw.rosterSpots.find(
      (p: any) => p.playerId === scope.shooter,
    ),
    goalie = raw.rosterSpots.find((p: any) => p.playerId === scope.goalie);
  if (
    !shooter ||
    shooter.teamId !== scope.owner ||
    !goalie ||
    goalie.positionCode !== "G" ||
    goalie.teamId === scope.owner ||
    ![raw.homeTeam.id, raw.awayTeam.id].includes(goalie.teamId)
  )
    throw Error("Wrong paired-PS roster actor/goalie");
  const native = raw.plays.filter(
    (p: any) =>
      p.periodDescriptor?.number === scope.period &&
      p.periodDescriptor?.periodType !== "SO" &&
      clock(p.timeInPeriod) === scope.second &&
      p.typeDescKey === "shot-on-goal" &&
      p.details?.eventOwnerTeamId === scope.owner &&
      p.details?.shootingPlayerId === scope.shooter,
  );
  if (
    native.length !== 2 ||
    !equal(
      native.map((p: any) => p.eventId).sort((a: number, b: number) => a - b),
      [...scope.ids].sort((a: number, b: number) => a - b),
    ) ||
    native.some(
      (p: any) =>
        p.details.goalieInNetId !== scope.goalie ||
        p.details.nhlReportPenaltyShot === true ||
        p.details.nhlReportUnclassifiedPenaltyShotContext === true,
    )
  )
    throw Error("Paired-PS full native group differs");
  const page = load(input.primaryHtml),
    text = (el: any) => page(el).text().replace(/\s+/g, " ").trim();
  const cells = page("td").toArray().map(text),
    expectedDate = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(scope.date + "T00:00:00Z"));
  if (
    page("title").text().trim() !== "Play By Play" ||
    !cells.includes(expectedDate) ||
    !cells.some(
      (s) =>
        /^(?:Game|Match\/Game)\s+\d+$/.test(s) &&
        Number(s.match(/\d+/)![0]) === raw.id % 10000,
    )
  )
    throw Error("Wrong paired-PS primary report scope");
  const records = page("tr")
    .toArray()
    .map((tr) => page(tr).children("td").toArray().map(text))
    .filter((r) => r.length === 8 && /^\d+$/.test(r[0]));
  const identifies = (r: string[]) => {
    const who = r[5].match(/^(\S+)\s+ONGOAL\s+-\s+#(\d+)\s+([^,]+)/);
    return (
      who &&
      who[1] === scope.reportTeam &&
      Number(who[2]) === shooter.sweaterNumber &&
      name(who[3]) === name(shooter.lastName.default)
    );
  };
  const group = records.filter(
    (r) =>
      Number(r[1]) === scope.period &&
      clock(r[3].match(/^\d+:\d\d/)?.[0] ?? "NaN") === scope.second &&
      r[4] === "SHOT" &&
      identifies(r),
  );
  if (
    group.length !== 2 ||
    !equal(
      group.map((r) => Number(r[0])),
      scope.ordinals,
    ) ||
    /Penalty Shot/i.test(group[0][5]) ||
    !/Penalty Shot/i.test(group[1][5]) ||
    records.filter(
      (r) =>
        ["SHOT", "MISS", "GOAL"].includes(r[4]) && /Penalty Shot/i.test(r[5]),
    ).length !== 1
  )
    throw Error("Paired-PS full primary group differs");
  for (let i = 0; i < 2; i++) {
    const primaryType = group[i][5]
      .match(/,\s*(?:Penalty Shot,\s*)?(Wrist|Backhand|Snap),/i)?.[1]
      ?.toLowerCase();
    if (primaryType !== scope.types[i])
      throw Error("Reviewed primary shot type changed");
  }
  const parseLineup = (value: string, teamId: number) => {
    const tokens = [...value.matchAll(/\b(\d{1,2})\s+([CDLRWG])\b/g)];
    if (!tokens.length || value.replace(/\b\d{1,2}\s+[CDLRWG]\b/g, "").trim())
      throw Error("Incomplete parsed printed lineup");
    const people = tokens.map((t) => {
      const found = raw.rosterSpots.filter(
        (p: any) => p.teamId === teamId && p.sweaterNumber === Number(t[1]),
      );
      if (
        found.length !== 1 ||
        (found[0].positionCode === "G") !== (t[2] === "G")
      )
        throw Error("Wrong printed roster/goalie identity");
      return found[0];
    });
    if (new Set(people.map((p) => p.playerId)).size !== people.length)
      throw Error("Duplicate printed roster player");
    return {
      ids: people.map((p) => p.playerId),
      skaters: people.filter((p) => p.positionCode !== "G").length,
      goalies: people
        .filter((p) => p.positionCode === "G")
        .map((p) => p.playerId),
    };
  };
  const lineups = group.map((r) => ({
    away: parseLineup(r[6], raw.awayTeam.id),
    home: parseLineup(r[7], raw.homeTeam.id),
  }));
  const offense = (lineup: any) =>
    scope.owner === raw.homeTeam.id ? lineup.home : lineup.away;
  const defense = (lineup: any) =>
    scope.owner === raw.homeTeam.id ? lineup.away : lineup.home;
  if (
    !equal(offense(lineups[1]).ids, [scope.shooter]) ||
    !equal(defense(lineups[1]).ids, [scope.goalie])
  )
    throw Error("Terminal PS is not the exact isolated shooter/goalie");
  if (
    offense(lineups[0]).skaters !== scope.ordinaryCounts[0] ||
    defense(lineups[0]).skaters !== scope.ordinaryCounts[1] ||
    !equal(defense(lineups[0]).goalies, [scope.goalie]) ||
    !offense(lineups[0]).ids.includes(scope.shooter) ||
    (raw.id === 2008021166
      ? !equal(offense(lineups[0]).ids, [scope.shooter])
      : offense(lineups[0]).goalies.length !== 1)
  )
    throw Error("Ordinary printed context differs from reviewed class");
  const intervening = records.filter(
    (r) => Number(r[0]) > scope.ordinals[0] && Number(r[0]) < scope.ordinals[1],
  );
  if (raw.id === 2008021166) {
    if (
      intervening.length !== 1 ||
      !equal(intervening[0].slice(0, 6), [
        "154",
        "2",
        "EV",
        "6:3113:29",
        "PENL",
        "TOR #2 SCHENN PS - Hooking on breakaway(0 min), Def. Zone Drawn By: MTL #84 LATENDRESSE",
      ])
    )
      throw Error("Exact intervening PS award changed");
  } else if (intervening.length)
    throw Error("Unexpected intervening source event");
  const appearanceBox = JSON.parse(input.officialAppearanceBoxText),
    appearanceIds = new Set<number>();
  if (appearanceBox.id !== raw.id || appearanceBox.gameDate !== raw.gameDate)
    throw Error("Canonical appearance box scope differs");
  for (const [side, groups] of Object.entries(
    appearanceBox.playerByGameStats,
  ) as any)
    for (const [kind, people] of Object.entries(groups) as any) {
      if (
        !["homeTeam", "awayTeam"].includes(side) ||
        !["forwards", "defense", "goalies"].includes(kind) ||
        !Array.isArray(people)
      )
        throw Error("Invalid canonical appearance group");
      const freshPeople = box.playerByGameStats[side]?.[kind];
      if (!Array.isArray(freshPeople))
        throw Error("Fresh appearance group missing");
      for (const p of people) {
        if (appearanceIds.has(p.playerId))
          throw Error("Duplicate canonical appearance");
        appearanceIds.add(p.playerId);
        const found = freshPeople.filter((q: any) => q.playerId === p.playerId);
        if (
          found.length !== 1 ||
          typeof p.toi !== "string" ||
          typeof found[0].toi !== "string" ||
          !/^\d+:[0-5]\d$/.test(p.toi) ||
          !/^\d+:[0-5]\d$/.test(found[0].toi) ||
          clock(found[0].toi) !== clock(p.toi)
        )
          throw Error(
            "Every canonical GP1 appearance and TOI must match fresh box",
          );
        if (
          kind === "goalies" &&
          (found[0].shotsAgainst !== p.shotsAgainst ||
            found[0].goalsAgainst !== p.goalsAgainst)
        )
          throw Error("Canonical goalie appearance counts differ");
      }
    }
  const onGoal = raw.plays.filter(
    (p: any) =>
      p.periodDescriptor?.periodType !== "SO" &&
      ["shot-on-goal", "goal"].includes(p.typeDescKey),
  );
  let totalSog = 0,
    totalGoals = 0;
  const persons: any[] = [];
  for (const [side, groups] of Object.entries(box.playerByGameStats) as any)
    for (const [kind, rows] of Object.entries(groups) as any) {
      if (
        !Array.isArray(rows) ||
        new Set(rows.map((p: any) => p.playerId)).size !== rows.length
      )
        throw Error("Incomplete/duplicate fresh box group");
      for (const p of rows) {
        const roster = raw.rosterSpots.filter(
          (r: any) => r.playerId === p.playerId,
        );
        if (
          roster.length !== 1 ||
          roster[0].teamId !==
            (side === "homeTeam" ? raw.homeTeam.id : raw.awayTeam.id) ||
          (kind === "goalies") !== (roster[0].positionCode === "G")
        )
          throw Error("Fresh box roster identity differs");
        if (
          !appearanceIds.has(p.playerId) &&
          ((typeof p.toi === "string" && clock(p.toi) > 0) ||
            (kind === "goalies"
              ? (p.shotsAgainst ?? 0) > 0 || (p.goalsAgainst ?? 0) > 0
              : p.sog > 0 || p.goals > 0))
        )
          throw Error(
            "Played fresh person missing from canonical appearance cohort",
          );
        if (kind === "goalies") {
          const seen = onGoal.filter(
            (q: any) => q.details?.goalieInNetId === p.playerId,
          );
          if (p.shotsAgainst === undefined && p.goalsAgainst === undefined) {
            if (seen.length)
              throw Error("Unknown fresh goalie counts have native exposure");
            persons.push({
              playerId: p.playerId,
              role: "G",
              countsUnknown: true,
            });
            continue;
          }
          if (
            !Number.isInteger(p.shotsAgainst) ||
            p.shotsAgainst < 0 ||
            !Number.isInteger(p.goalsAgainst) ||
            p.goalsAgainst < 0 ||
            seen.length !== p.shotsAgainst ||
            seen.filter((q: any) => q.typeDescKey === "goal").length !==
              p.goalsAgainst
          )
            throw Error("Full fresh goalie SA/GA conservation failed");
        } else {
          const seen = onGoal.filter(
            (q: any) =>
              (q.details?.shootingPlayerId ?? q.details?.scoringPlayerId) ===
              p.playerId,
          );
          if (
            !Number.isInteger(p.sog) ||
            p.sog < 0 ||
            !Number.isInteger(p.goals) ||
            p.goals < 0 ||
            seen.length !== p.sog ||
            seen.filter((q: any) => q.typeDescKey === "goal").length !== p.goals
          )
            throw Error("Full fresh skater SOG/G conservation failed");
          totalSog += p.sog;
          totalGoals += p.goals;
        }
        persons.push({ playerId: p.playerId, role: kind });
      }
    }
  const skaterOnGoal = onGoal.filter(
    (p: any) =>
      raw.rosterSpots.find(
        (r: any) =>
          r.playerId ===
          (p.details?.shootingPlayerId ?? p.details?.scoringPlayerId),
      ).positionCode !== "G",
  );
  if (
    new Set(persons.map((p) => p.playerId)).size !== persons.length ||
    totalSog !== skaterOnGoal.length ||
    totalGoals !==
      skaterOnGoal.filter((q: any) => q.typeDescKey === "goal").length
  )
    throw Error("Whole box physical population/count conservation failed");
  const strip = (p: any) => {
    const copy = structuredClone(p);
    delete copy.eventId;
    delete copy.sortOrder;
    return copy;
  };
  const uniqueAssignments =
    raw.id === 2008020727
      ? []
      : scope.ids.map((id: number, i: number) => {
          const p = native.find((p: any) => p.eventId === id);
          if (
            p.details.shotType !== scope.types[i] ||
            native.filter((p: any) => p.details.shotType === scope.types[i])
              .length !== 1
          )
            throw Error(
              "Native/primary shot type does not establish unique identity",
            );
          return {
            eventId: id,
            ordinal: scope.ordinals[i],
            penaltyShot: i === 1,
            unclassified: raw.id === 2008021166 && i === 0,
          };
        });
  if (
    raw.id === 2008020727 &&
    (!equal(strip(native[0]), strip(native[1])) ||
      native[0].details.shotType !== "wrist")
  )
    throw Error("Unresolved group is not full-payload equivalent");
  return {
    version: "nhl-reviewed-paired-nonscoring-ps-source-v1",
    gameId: raw.id,
    sourceHashes: {
      rawPbpSha256: hash(input.rawPbpText),
      inputPbpSha256: hash(JSON.stringify(raw)),
      primarySha256: hash(input.primaryHtml),
      freshBoxSha256: hash(input.freshBoxText),
      canonicalAppearanceBoxSha256: hash(input.officialAppearanceBoxText),
      ledgerSha256: hash(JSON.stringify(input.totals)),
    },
    primaryRows: group,
    originalNative: structuredClone(native),
    lineups,
    intervening,
    assignments: uniqueAssignments,
    unresolvedBijections:
      raw.id === 2008020727
        ? [
            scope.ids.map((id: number, i: number) => ({
              eventId: id,
              ordinal: scope.ordinals[i],
              penaltyShot: i === 1,
              unclassified: false,
            })),
            [...scope.ids].reverse().map((id: number, i: number) => ({
              eventId: id,
              ordinal: scope.ordinals[i],
              penaltyShot: i === 1,
              unclassified: false,
            })),
          ]
        : [],
    identity:
      raw.id === 2008020727
        ? "model-equivalent-ambiguous-serialization-only"
        : "unique-shot-type",
    ordinaryValue:
      raw.id === 2008021166
        ? "unclassified"
        : "requires-normal-bridge-source-verification",
    nativeOnGoal: onGoal.length,
    nativeGoals: onGoal.filter((p: any) => p.typeDescKey === "goal").length,
    goalieOwnOnGoalEvents: onGoal
      .filter((p: any) => !skaterOnGoal.includes(p))
      .map((p: any) => p.eventId),
    verifiedOfficialAppearances: appearanceIds.size,
    verifiedFreshBoxPersons: persons,
    interpretation:
      "Native facts/denominators retained. No PS geometry added. 0727 explicit reviewed branch slots have complete full-game feature/physical/component parity; they remain serialization-only and do not resolve original native identity.",
  };
}
