import { createHash } from "node:crypto";
import { load } from "cheerio";
import type { OfficialShotCreditSources } from "./official-shot-credit-reconciliation";

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid primary-event source object");
  return value as Obj;
};
const array = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw Error("Invalid primary-event population");
  return value;
};
const count = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw Error("Invalid primary-event count/identity");
  return value;
};
const norm = (value: unknown) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
const teamCode = (value: unknown) =>
  (({ NJ: "NJD", TB: "TBL", SJ: "SJS", LA: "LAK" }) as Record<string, string>)[
    norm(value)
  ] ?? norm(value);
const clock = (value: unknown) => {
  if (typeof value !== "string" || !/^\d+:\d{2}$/.test(value))
    throw Error("Invalid primary-event clock");
  const [m, s] = value.split(":").map(Number);
  if (s! >= 60) throw Error("Invalid primary-event seconds");
  return m! * 60 + s!;
};
const textClock = (second: number) =>
  `${Math.floor(second / 60)}:${String(second % 60).padStart(2, "0")}`;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const kindMap: Record<string, string> = {
  SHOT: "shot-on-goal",
  GOAL: "goal",
  MISS: "missed-shot",
  BLOCK: "blocked-shot",
  FAC: "faceoff",
  HIT: "hit",
  GIVE: "giveaway",
  TAKE: "takeaway",
  PENL: "penalty",
  STOP: "stoppage",
  PSTR: "period-start",
  PEND: "period-end",
  GEND: "game-end",
  CHL: "challenge",
};
const typeName = (value: unknown) =>
  (
    ({
      BACK: "backhand",
      DEFL: "deflected",
      TIP: "tip-in",
      WRAP: "wrap-around",
      WRAPAROUND: "wrap-around",
      TIPIN: "tip-in",
    }) as Record<string, string>
  )[norm(value)] ?? String(value).toLowerCase();
export const REVIEWED_PRIMARY_RECOVERY_GAME_IDS = [
  2009020108, 2009021104, 2009020801, 2009020311, 2009020449, 2009020759,
  2009020889, 2009020330, 2009020625, 2009020213, 2009020134,
] as const;

/** An alternate, complete primary-report event stream for explicitly reviewed
 * corrupt native feeds. Original records remain fully preserved in the proof.
 * No prediction, provider xGoal or inferred clock enters the reconstruction. */
export function recoverOfficialPrimaryEvents(input: OfficialShotCreditSources) {
  const raw = obj(JSON.parse(input.rawPbpText)),
    effective = obj(input.effectivePbp),
    box = obj(JSON.parse(input.boxscoreText)),
    gameId = count(effective.id),
    day = String(effective.gameDate);
  if (
    !(REVIEWED_PRIMARY_RECOVERY_GAME_IDS as readonly number[]).includes(
      gameId,
    ) ||
    raw.id !== gameId ||
    box.id !== gameId ||
    raw.gameDate !== day ||
    box.gameDate !== day ||
    effective.gameType !== 2 ||
    raw.gameType !== 2 ||
    effective.gameState !== "OFF" ||
    input.providerArchive.url !==
      "https://peter-tanner.com/moneypuck/downloads/shots_2009.zip" ||
    !/^[a-f0-9]{64}$/.test(input.providerArchive.sha256)
  )
    throw Error("Unsupported reviewed primary-event recovery scope");
  const home = obj(effective.homeTeam),
    away = obj(effective.awayTeam),
    roster = array(effective.rosterSpots).map(obj),
    native = array(effective.plays).map(obj),
    originals = array(raw.plays).map(obj);
  if (JSON.stringify(raw.rosterSpots) !== JSON.stringify(effective.rosterSpots))
    throw Error("Primary-event native roster changed before recovery");
  for (const side of ["homeTeam", "awayTeam"]) {
    const t = obj(effective[side]),
      r = obj(raw[side]),
      b = obj(box[side]);
    if (
      t.id !== r.id ||
      t.id !== b.id ||
      t.abbrev !== r.abbrev ||
      t.abbrev !== b.abbrev ||
      t.score !== b.score
    )
      throw Error("Primary-event official team identity differs");
  }
  if (
    new Set(roster.map((p) => count(p.playerId))).size !== roster.length ||
    new Set(native.map((p) => count(p.eventId))).size !== native.length
  )
    throw Error("Duplicate primary-event roster/native identity");
  const team = (abbr: unknown) =>
    teamCode(abbr) === teamCode(home.abbrev)
      ? home.id
      : teamCode(abbr) === teamCode(away.abbrev)
        ? away.id
        : undefined;
  const nameMatches = (person: Obj, name: string) =>
    norm(obj(person.lastName).default) === norm(name) ||
    (person.playerId === 8471269 &&
      norm(obj(person.firstName).default) === "NICKLAS" &&
      norm(obj(person.lastName).default) === "GROSSMANN" &&
      norm(name) === "GROSSMAN");
  const person = (side: unknown, jersey: number, name?: string) => {
    const found = roster.filter(
      (p) =>
        p.teamId === side &&
        p.sweaterNumber === jersey &&
        (name === undefined || nameMatches(p, name)),
    );
    if (found.length !== 1)
      throw Error("Primary-event actor is not uniquely roster verified");
    return found[0]!;
  };
  const fullDate = new Date(day + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const report = (html: string, title: string) => {
    const page = load(html),
      rows = page("tr")
        .toArray()
        .map((tr) =>
          page(tr)
            .children("td")
            .toArray()
            .map((td) => page(td).text().replace(/\s+/g, " ").trim()),
        );
    if (
      page("title").text().trim() !== title ||
      !rows.flat().includes(fullDate) ||
      !rows
        .flat()
        .some((s) =>
          new RegExp(`^(?:Match/)?Game\\s+0*${gameId % 10000}$`).test(s),
        )
    )
      throw Error("Wrong primary-event report identity/date");
    const logos = page("img")
      .toArray()
      .map(
        (img) =>
          page(img)
            .attr("src")
            ?.match(/logoc([a-z]+)\.gif/i)?.[1],
      )
      .filter((v) => v !== undefined && norm(v) !== "NHL");
    if (
      !logos.length ||
      logos.length % 2 !== 0 ||
      logos.some(
        (abbr, index) =>
          teamCode(abbr) !==
          teamCode(index % 2 === 0 ? away.abbrev : home.abbrev),
      )
    )
      throw Error("Primary-event report team order differs");
    if (
      !rows.some(
        (r) =>
          r.length === 3 &&
          Number(r[0]!.match(/^VISITOR\s+(\d+)\b/)?.[1]) === away.score &&
          Number(r[2]!.match(/^HOME\s+(\d+)\b/)?.[1]) === home.score,
      )
    )
      throw Error("Primary-event report final scores differ");
    return rows;
  };
  const rows = report(input.playReportHtml, "Play By Play"),
    gs = report(input.gameSummaryHtml, "Game Summary");
  const usedNative = new Set<number>(),
    usedArchive = new Set<number>(),
    ordinals = new Set<number>(),
    outputPlays: Obj[] = [],
    mapping: Obj[] = [],
    penalties: Obj[] = [],
    derivedContext: Obj[] = [],
    geometryDisagreements: Obj[] = [];
  let previousPeriod = 0,
    previousSecond = 0,
    previousOrdinal = 0;
  const lineup = (text: string, side: unknown) => {
    const found = [...text.matchAll(/\b(\d{1,2})\s+([CDLRWG]{1,2})\b/g)].map(
      (t) => {
        const p = person(side, Number(t[1]));
        if ((p.positionCode === "G") !== (t[2] === "G"))
          throw Error("Primary-event on-ice role differs");
        return p;
      },
    );
    if (new Set(found.map((p) => p.playerId)).size !== found.length)
      throw Error("Duplicate primary-event on-ice player");
    const goalies = found.filter((p) => p.positionCode === "G");
    if (goalies.length > 1) throw Error("Multiple primary-event goalies");
    return {
      ids: new Set(found.map((p) => p.playerId)),
      goalie: goalies[0]?.playerId ?? 0,
      skaters: found.length - goalies.length,
    };
  };
  for (const row of rows) {
    if (row.length !== 8 || !/^\d+$/.test(row[0]!) || !/^\d+$/.test(row[1]!))
      continue;
    const ordinal = Number(row[0]),
      period = Number(row[1]);
    if (period > 4) continue;
    const second = clock(row[3]!.match(/^\d+:\d{2}/)?.[0]),
      code = row[4]!,
      kind =
        kindMap[code] ??
        (/^[A-Z]{2,8}$/.test(code)
          ? `nhl-report-${code.toLowerCase()}`
          : undefined),
      description = row[5]!;
    if (
      !kind ||
      ordinal < 1 ||
      ordinals.has(ordinal) ||
      period < 1 ||
      second > (period === 4 ? 300 : 1200)
    )
      throw Error("Invalid/duplicate primary-event report ordinal/clock");
    ordinals.add(ordinal);
    if (
      ordinal <= previousOrdinal ||
      period < previousPeriod ||
      (period === previousPeriod && second < previousSecond)
    )
      throw Error("Primary-event report chronology is inconsistent");
    previousPeriod = period;
    previousSecond = second;
    previousOrdinal = ordinal;
    const owner = team(description.split(" ")[0]),
      zone = description.match(/\b(Off|Def|Neu)\. Zone\b/),
      details: Obj = {
        nhlOfficialReportDescription: description,
        ...(owner !== undefined ? { eventOwnerTeamId: owner } : {}),
        ...(zone
          ? {
              zoneCode: (
                { Off: "O", Def: "D", Neu: "N" } as Record<string, string>
              )[zone[1]!],
            }
          : {}),
      };
    let physical = false,
      situation: string | undefined;
    if (["SHOT", "MISS", "GOAL"].includes(code)) {
      const label = description.match(/#(\d+)\s+([^,]+)/);
      if (!label || owner === undefined || !zone)
        throw Error("Missing primary-event shot identity/zone");
      const shooter = person(
          owner,
          Number(label[1]),
          label[2]!.replace(/\([^)]*\)/g, "").trim(),
        ),
        ownHome = owner === home.id,
        h = lineup(row[7]!, home.id),
        a = lineup(row[6]!, away.id),
        opposing = ownHome ? a : h;
      const archive = input.providerRows.filter(
        (r) => r.gameId === gameId && r.ordinal === ordinal,
      );
      if (archive.length !== 1)
        throw Error("Primary-event/raw-archive cardinality differs");
      const mp = archive[0]!;
      if (
        mp.kind !== code ||
        mp.period !== period ||
        mp.second !== second ||
        mp.shooter !== shooter.playerId ||
        mp.goalie !== opposing.goalie ||
        mp.home !== ownHome ||
        mp.homeSkaters !== h.skaters ||
        mp.awaySkaters !== a.skaters ||
        mp.homeGoalie !== (h.goalie !== 0) ||
        mp.awayGoalie !== (a.goalie !== 0) ||
        !Number.isFinite(mp.x) ||
        !Number.isFinite(mp.y) ||
        Math.abs(mp.x) > 100 ||
        Math.abs(mp.y) > 43 ||
        (mp.x === 0 && mp.y === 0) ||
        usedArchive.has(ordinal)
      )
        throw Error("Primary-event/raw-archive physical facts differ");
      const printedType = description.match(
        /,\s*(Wrist|Backhand|Slap|Snap|Tip-In|Deflected|Wrap-around)\b/i,
      )?.[1];
      if (printedType && typeName(printedType) !== typeName(mp.shotType))
        throw Error("Primary-event/raw-archive shot type differs");
      usedArchive.add(ordinal);
      physical = true;
      situation = `${a.goalie ? 1 : 0}${a.skaters}${h.skaters}${h.goalie ? 1 : 0}`;
      Object.assign(details, {
        [code === "GOAL" ? "scoringPlayerId" : "shootingPlayerId"]:
          shooter.playerId,
        ...(opposing.goalie ? { goalieInNetId: opposing.goalie } : {}),
        xCoord: mp.x,
        yCoord: mp.y,
        shotType: typeName(printedType ?? mp.shotType),
      });
      if (/Penalty Shot/i.test(description))
        details.nhlReportPenaltyShot = true;
    } else if (code === "PENL") {
      if (owner === undefined)
        throw Error("Missing primary-event penalty team");
      const duration = description.match(/\((\d+)\s+min\)/i);
      if (!duration) throw Error("Missing primary-event penalty duration");
      const minutes = Number(duration[1]),
        bench = /^\S+\s+TEAM\b/.test(description),
        label = description.match(/^\S+\s+#(\d+)\s+(.+?)\((\d+)\s+min\)/i);
      let committed: Obj | undefined,
        offence = description;
      if (!bench) {
        if (!label) throw Error("Missing primary-event penalty offender");
        committed = person(owner, Number(label[1]));
        const words = label[2]!.trim().split(/\s+/);
        let prefix = 0;
        for (let n = 1; n <= words.length; n++)
          if (nameMatches(committed, words.slice(0, n).join(" "))) prefix = n;
        if (!prefix) throw Error("Primary-event penalty offender name differs");
        offence = words.slice(prefix).join(" ");
        details.committedByPlayerId = committed.playerId;
      }
      const type = bench
        ? "BEN"
        : /Game Misconduct/i.test(offence)
          ? "GAM"
          : /Misconduct/i.test(offence)
            ? "MIS"
            : /\(maj\)/i.test(offence)
              ? "MAJ"
              : minutes === 2 || minutes === 4
                ? "MIN"
                : undefined;
      if (
        !type ||
        ![2, 4, 5, 10].includes(minutes) ||
        (type === "MAJ" && minutes !== 5) ||
        (["GAM", "MIS"].includes(type) && minutes !== 10)
      )
        throw Error("Unsupported primary-event penalty class");
      details.typeCode = type;
      details.duration = minutes;
      details.descKey = offence;
      const served = description.match(
          /Served By:\s*#(\d+)\s+(.+?)(?=,\s*(?:Off|Def|Neu)\. Zone|\s+Drawn By:|$)/i,
        ),
        drawn =
          description.match(
            /Drawn By:\s*\S+\s+#(\d+)\s+(.+?)(?=\s+Served By:|$)/i,
          ) ??
          description.match(/Drawn By:\s*#(\d+)\s+(.+?)(?=\s+Served By:|$)/i);
      if (served)
        details.servedByPlayerId = person(
          owner,
          Number(served[1]),
          served[2]!.trim(),
        ).playerId;
      if (drawn)
        details.drawnByPlayerId = person(
          owner === home.id ? away.id : home.id,
          Number(drawn[1]),
          drawn[2]!.trim(),
        ).playerId;
      penalties.push({
        ordinal,
        period,
        second,
        team: owner,
        playerId: committed?.playerId ?? null,
        minutes,
        type,
        offence,
        bench,
      });
    } else {
      const label = description.match(
        /^\S+\s+#(\d+)\s+([^,]+?)(?=\s+(?:HIT|BLOCKED BY)|,|$)/,
      );
      if (label && owner !== undefined) {
        const p = person(owner, Number(label[1]), label[2]!.trim());
        if (code === "BLOCK") details.shootingPlayerId = p.playerId;
        else if (code === "HIT") details.hittingPlayerId = p.playerId;
      }
    }
    const relevant = [
      "shootingPlayerId",
      "scoringPlayerId",
      "committedByPlayerId",
      "drawnByPlayerId",
      "servedByPlayerId",
      "winningPlayerId",
      "losingPlayerId",
      "hittingPlayerId",
      "hitteePlayerId",
      "blockingPlayerId",
    ];
    const candidates = native.filter((p) => {
      if (
        obj(p.periodDescriptor).periodType === "SO" ||
        p.typeDescKey !== kind ||
        obj(p.periodDescriptor).number !== period ||
        clock(p.timeInPeriod) !== second ||
        usedNative.has(Number(p.eventId))
      )
        return false;
      const d = p.details ? obj(p.details) : {};
      if (owner !== undefined && d.eventOwnerTeamId !== owner) return false;
      if (
        details.zoneCode !== undefined &&
        d.zoneCode !== undefined &&
        details.zoneCode !== d.zoneCode
      )
        return false;
      if (physical) {
        const shooter = details.shootingPlayerId ?? details.scoringPlayerId;
        return (
          (d.shootingPlayerId ?? d.scoringPlayerId) === shooter &&
          Number(d.goalieInNetId ?? 0) === Number(details.goalieInNetId ?? 0) &&
          (p.situationCode === undefined || p.situationCode === situation) &&
          (d.shotType === undefined ||
            typeName(d.shotType) === typeName(details.shotType))
        );
      }
      if (
        code === "PENL" &&
        (["duration", "typeCode"].some((k) => d[k] !== details[k]) ||
          (d.descKey !== undefined &&
            norm(String(d.descKey).replace(/\(maj\)/gi, "")) !==
              norm(String(details.descKey).replace(/\(maj\)/gi, ""))))
      )
        return false;
      return relevant.every(
        (k) =>
          d[k] === undefined ||
          (details[k] !== undefined && d[k] === details[k]),
      );
    });
    const match = candidates.length === 1 ? candidates[0] : undefined,
      derivedId = 1000000000 + ordinal;
    if ([...native, ...originals].some((p) => p.eventId === derivedId))
      throw Error("Primary-event derived identity collides with native source");
    let event: Obj;
    if (match) {
      event = structuredClone(match);
      usedNative.add(count(match.eventId));
      const d = event.details ? obj(event.details) : {};
      if (physical) {
        const valid =
          [d.xCoord, d.yCoord].every(
            (v) => typeof v === "number" && Number.isFinite(v),
          ) &&
          Math.abs(Number(d.xCoord)) <= 100 &&
          Math.abs(Number(d.yCoord)) <= 43 &&
          !(d.xCoord === 0 && d.yCoord === 0);
        if (!valid) {
          d.xCoord = details.xCoord;
          d.yCoord = details.yCoord;
        } else if (d.xCoord !== details.xCoord || d.yCoord !== details.yCoord)
          geometryDisagreements.push({
            eventId: match.eventId,
            ordinal,
            native: { x: d.xCoord, y: d.yCoord },
            provider: { x: details.xCoord, y: details.yCoord },
          });
      }
      for (const [key, value] of Object.entries(details))
        if (d[key] === undefined) d[key] = value;
      event.details = d;
      event.sortOrder = ordinal;
      if (situation) event.situationCode = situation;
    } else {
      event = {
        eventId: derivedId,
        sortOrder: ordinal,
        typeDescKey: kind,
        periodDescriptor: {
          number: period,
          periodType: period === 4 ? "OT" : "REG",
        },
        timeInPeriod: textClock(second),
        ...(situation ? { situationCode: situation } : {}),
        details: {
          ...details,
          nhlOfficialDerivedEvent: "reviewed-complete-primary-event-v1",
        },
      };
      derivedContext.push({ ordinal, eventId: derivedId, kind, physical });
    }
    mapping.push({
      ordinal,
      eventId: event.eventId,
      kind,
      identity: match
        ? "unique-correct-native-primary-pair"
        : "primary-report-derived",
      candidateNativeIds: candidates.map((p) => p.eventId),
    });
    outputPlays.push(event);
  }
  if (
    !outputPlays.length ||
    input.providerRows.length !== usedArchive.size ||
    input.providerRows.some(
      (r) => r.gameId !== gameId || !usedArchive.has(r.ordinal),
    )
  )
    throw Error("Complete primary/raw archive attempt multiset differs");
  const nativeShootout = native
    .filter((p) => obj(p.periodDescriptor).periodType === "SO")
    .map((p) => structuredClone(p));
  const output = {
    ...structuredClone(effective),
    plays: [
      ...outputPlays.sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder)),
      ...nativeShootout,
    ],
  };
  const scoring = gs
    .filter(
      (r) =>
        r.length === 10 &&
        /^\d+$/.test(r[0]!) &&
        (/^\d+$/.test(r[1]!) || r[1] === "OT") &&
        (r[1] === "OT" || Number(r[1]) <= 4),
    )
    .map((r) => {
      const side = team(r[4]),
        label = r[5]!.match(/^(\d+)\s+(.+?)\(/);
      if (side === undefined || !label)
        throw Error("Invalid primary-event GS scoring row");
      const scorer = person(side, Number(label[1]));
      if (!norm(label[2]).endsWith(norm(obj(scorer.lastName).default)))
        throw Error("Primary-event GS scorer differs");
      return {
        period: r[1] === "OT" ? 4 : Number(r[1]),
        second: clock(r[2]),
        playerId: scorer.playerId,
        team: side,
      };
    });
  const goals = outputPlays.filter((p) => p.typeDescKey === "goal");
  if (
    goals.length !== scoring.length ||
    goals.some((p) => {
      const d = obj(p.details);
      return (
        scoring.filter(
          (g) =>
            g.period === obj(p.periodDescriptor).number &&
            g.second === clock(p.timeInPeriod) &&
            g.playerId === d.scoringPlayerId &&
            g.team === d.eventOwnerTeamId,
        ).length !== 1
      );
    })
  )
    throw Error("Complete primary/GS goal ledger differs");
  const gsPenalties = gs.filter(
    (r) =>
      r.length === 6 &&
      /^\d+$/.test(r[0]!) &&
      (/^\d+$/.test(r[1]!) || r[1] === "OT") &&
      /^\d+:\d{2}$/.test(r[2]!) &&
      /^\d+$/.test(r[4]!),
  );
  const unusedGs = new Set(gsPenalties.map((_, i) => i));
  for (const p of penalties) {
    const matches = [...unusedGs].filter((i) => {
      const r = gsPenalties[i]!;
      if (
        (r[1] === "OT" ? 4 : Number(r[1])) !== p.period ||
        clock(r[2]) !== p.second ||
        Number(r[4]) !== p.minutes ||
        (!p.bench &&
          norm(r[5]!.replace(/\(\d+\s+min\)/gi, "")) !== norm(p.offence))
      )
        return false;
      if (p.bench) return r[3] === "TEAM";
      const player = roster.find((r) => r.playerId === p.playerId)!,
        label = r[3]!.match(/^(\d+)\s+(.+)$/);
      return (
        label &&
        Number(label[1]) === player.sweaterNumber &&
        norm(label[2]).endsWith(norm(obj(player.lastName).default))
      );
    });
    if (matches.length !== 1)
      throw Error("Primary/GS penalty ledger is ambiguous or incomplete");
    unusedGs.delete(matches[0]!);
  }
  if (unusedGs.size)
    throw Error("GS penalties missing from complete primary recovery");
  const onGoal = outputPlays.filter((p) =>
      ["shot-on-goal", "goal"].includes(String(p.typeDescKey)),
    ),
    allCounts: Obj[] = [],
    onGoalCountDifferences: Obj[] = [],
    boxIds = new Map<number, { team: unknown; goalie: boolean }>();
  for (const [side, t] of [
    ["homeTeam", home],
    ["awayTeam", away],
  ] as const) {
    const stats = obj(obj(box.playerByGameStats)[side]),
      teamBox = obj(box[side]),
      own = onGoal.filter((p) => obj(p.details).eventOwnerTeamId === t.id);
    const teamDifference = own.length - count(teamBox.sog);
    if (teamDifference < 0)
      throw Error("Primary physical source misses official team SOG");
    for (const group of ["forwards", "defense", "goalies"]) {
      for (const p of array(stats[group]).map(obj)) {
        const id = count(p.playerId),
          goalie = group === "goalies";
        if (
          !id ||
          boxIds.has(id) ||
          roster.filter(
            (r) =>
              r.playerId === id &&
              r.teamId === t.id &&
              (r.positionCode === "G") === goalie,
          ).length !== 1
        )
          throw Error("Complete primary official player identity differs");
        boxIds.set(id, { team: t.id, goalie });
        const mine = onGoal.filter((e) => {
            const d = obj(e.details);
            return goalie
              ? d.goalieInNetId === id
              : (d.shootingPlayerId ?? d.scoringPlayerId) === id;
          }),
          official = count(goalie ? p.shotsAgainst : p.sog),
          officialGoals = count(goalie ? p.goalsAgainst : p.goals),
          primaryGoals = mine.filter((e) => e.typeDescKey === "goal").length,
          pim = penalties
            .filter((q) => q.playerId === id)
            .reduce((n, q) => n + Number(q.minutes), 0);
        if (
          primaryGoals !== officialGoals ||
          pim !== count(p.pim) ||
          mine.length < official
        )
          throw Error("Complete primary official goals/PIM/exposure differs");
        const row = {
          playerId: id,
          position: goalie ? "G" : "skater",
          officialOnGoal: official,
          primaryOnGoal: mine.length,
          officialGoals,
          primaryGoals,
          officialPim: p.pim,
          primaryPim: pim,
        };
        allCounts.push(row);
        if (mine.length !== official) onGoalCountDifferences.push(row);
      }
    }
    if (
      own.filter((p) => p.typeDescKey === "goal").length !==
      scoring.filter((g) => g.team === t.id).length
    )
      throw Error("Complete primary team goal ledger differs");
  }
  if (
    onGoalCountDifferences.length &&
    ![2009020213, 2009020134].includes(gameId)
  )
    throw Error("Special-case full official SOG/SA conservation failed");
  if (
    onGoal.some((p) => {
      const d = obj(p.details),
        shooter = boxIds.get(Number(d.shootingPlayerId ?? d.scoringPlayerId)),
        goalie = boxIds.get(Number(d.goalieInNetId));
      return (
        !shooter ||
        shooter.team !== d.eventOwnerTeamId ||
        (Number(d.goalieInNetId) > 0 &&
          (!goalie || !goalie.goalie || goalie.team === d.eventOwnerTeamId))
      );
    })
  )
    throw Error("Complete primary event role/team identity differs");
  return {
    pbp: output,
    proof: {
      version: "nhl-reviewed-complete-primary-event-recovery-v1" as const,
      gameId,
      date: day,
      originalRawPbpSha256: sha(input.rawPbpText),
      preOverlayEffectivePbpSha256: sha(JSON.stringify(effective)),
      outputSha256: sha(JSON.stringify(output)),
      officialPlayReportSha256: sha(input.playReportHtml),
      officialGameSummarySha256: sha(input.gameSummaryHtml),
      officialBoxSha256: sha(input.boxscoreText),
      providerArchive: { ...input.providerArchive },
      mapping,
      derivedContext,
      geometryDisagreements,
      originalNativeRecords: structuredClone(originals),
      preOverlayNativeRecords: structuredClone(native),
      excludedNativeRecords: native
        .filter(
          (p) =>
            obj(p.periodDescriptor).periodType !== "SO" &&
            !usedNative.has(Number(p.eventId)),
        )
        .map((p) => structuredClone(p)),
      preservedNativeShootout: nativeShootout,
      penalties,
      allCounts,
      onGoalCountDifferences,
      requiresOnGoalClassificationReview: onGoalCountDifferences.length > 0,
      completeSourceContext: true,
      providerProbabilitiesUsed: false,
      interpretation:
        "Complete regular primary-report chronology and exact observed archive attempt multiset replace the reviewed corrupt native event stream. Uniquely correct native event identities and valid geometry are retained; unmatched primary identities are explicitly derived, and every original/excluded native record is preserved in this proof. Fresh official goals and individual PIM plus GS ledgers must agree exactly. Any listed SOG classification differences require separate whole-physical-group review before installation; they are never automatically forgiven.",
    },
  };
}
