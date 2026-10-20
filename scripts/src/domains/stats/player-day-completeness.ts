type Row = Readonly<Record<string, unknown>>;
export type PlayerDayCompletenessInput = {
  seasons: readonly Row[];
  teams: readonly Row[];
  weeks: readonly Row[];
  /** Complete season matchup inventory, including all consolation/LT games. */
  matchups?: readonly Row[];
  /** Complete canonical player inventory, not a subset of rostered people. */
  players?: readonly Row[];
  rows: Iterable<Row>;
  cutoff: string;
  /** A review heuristic, never an assertion of minimum legal roster size. */
  minimumRosterCount?: number;
};
export type PlayerDayRosterCountFlag = {
  seasonId: string;
  teamId: string;
  date: string;
  count: number;
  expectedRegularCapacity: number | null;
  startingCapacity: number | null;
  maximumCapacity: number | null;
  countShortfall: number | null;
  previousDateCount: number | null;
  nextDateCount: number | null;
  nearbyMaximumCount: number | null;
  nearbyCountDrop: number;
  reviewSeverity:
    | "missing-team-date"
    | "below-starting-capacity"
    | "below-regular-capacity"
    | "nearby-count-drop"
    | "below-review-threshold";
  reasons: string[];
};
type Issue = {
  kind: string;
  id?: string;
  seasonId?: string;
  teamId?: string;
  date?: string;
  fields?: string[];
};
const DAY = 86_400_000;
const MIN_NEARBY_ROSTER_DROP = 5;
const MIN_ROSTER_SHORTFALL = 2;
const SKATER = ["G", "A", "P", "PM", "PIM", "PPP", "SOG", "HIT", "BLK"];
const GOALIE = ["W", "GAA", "SV", "SVP", "SO"];
const SUPPORT = ["GA", "SA", "TOI"];
const missing = (v: unknown) =>
  v === null || v === undefined || (typeof v === "string" && !v.trim());
const number = (v: unknown): number | null => {
  if (missing(v) || (typeof v !== "number" && typeof v !== "string"))
    return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const id = (row: Row) =>
  typeof row._id === "string" && row._id.trim() === row._id && row._id
    ? row._id
    : null;
const key = (...parts: string[]) => JSON.stringify(parts);

/** UTC date normalization with calendar roundtrip; row day keys are stricter. */
export function playerDayCalendarDate(value: unknown): string | null {
  let instant: number;
  if (typeof value === "number") instant = value;
  else if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)
  ) {
    if (value.length !== 10 && !/(?:Z|[+-]\d{2}:\d{2})$/.test(value))
      return null;
    instant = Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value);
    if (!Number.isFinite(instant)) return null;
    const prefix = value.slice(0, 10);
    const midnight = Date.parse(`${prefix}T00:00:00Z`);
    if (
      !Number.isFinite(midnight) ||
      new Date(midnight).toISOString().slice(0, 10) !== prefix
    )
      return null;
  } else return null;
  if (!Number.isFinite(instant)) return null;
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) return null;
  const result = date.toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : null;
}
const shift = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY)
    .toISOString()
    .slice(0, 10);

/**
 * Audit stored coverage against fantasy weeks and recorded postseason participation.
 * It cannot infer the exact roster or missing player rows
 * from a team's row count, or prove no NHL game occurred from blank GP.
 */
export function auditPlayerDayCompleteness(input: PlayerDayCompletenessInput) {
  if (
    typeof input.cutoff !== "string" ||
    input.cutoff.length !== 10 ||
    playerDayCalendarDate(input.cutoff) !== input.cutoff
  )
    throw Error("Completeness cutoff must be a valid YYYY-MM-DD UTC day key");
  if (
    input.minimumRosterCount !== undefined &&
    (!Number.isSafeInteger(input.minimumRosterCount) ||
      input.minimumRosterCount < 1)
  )
    throw Error("Review roster threshold must be a positive integer");
  const invalidReferences: Issue[] = [],
    calendarIssues: Issue[] = [],
    categoryPolicyUnknownSeasons: string[] = [];
  const inventory = (rows: readonly Row[], kind: string) => {
    const result = new Map<string, Row>();
    for (const row of rows) {
      const token = id(row);
      if (!token || result.has(token)) {
        invalidReferences.push({
          kind: `invalid-or-duplicate-${kind}-identity`,
          ...(token ? { id: token } : {}),
        });
        continue;
      }
      result.set(token, row);
    }
    return result;
  };
  const seasons = inventory(input.seasons, "season"),
    teams = inventory(input.teams, "team"),
    weeks = inventory(input.weeks, "week");
  const players =
    input.players === undefined ? null : inventory(input.players, "player");
  for (const [teamId, team] of teams)
    if (typeof team.seasonId !== "string" || !seasons.has(team.seasonId))
      invalidReferences.push({ kind: "team-season", id: teamId });
  const datesBySeason = new Map<string, Map<string, string[]>>();
  const weekBounds = new Map<string, { start: string; end: string }>();
  for (const [weekId, week] of weeks) {
    if (typeof week.seasonId !== "string" || !seasons.has(week.seasonId)) {
      invalidReferences.push({ kind: "week-season", id: weekId });
      continue;
    }
    const start = playerDayCalendarDate(week.startDate),
      end = playerDayCalendarDate(week.endDate);
    if (
      !start ||
      !end ||
      end < start ||
      Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`) >
        366 * DAY
    ) {
      calendarIssues.push({
        kind: "invalid-week-bounds",
        id: weekId,
        seasonId: week.seasonId,
      });
      continue;
    }
    weekBounds.set(weekId, { start, end });
    if (start > input.cutoff) continue;
    const dates =
      datesBySeason.get(week.seasonId) ?? new Map<string, string[]>();
    for (let d = start; d <= end && d <= input.cutoff; d = shift(d, 1)) {
      const ids = dates.get(d) ?? [];
      ids.push(weekId);
      dates.set(d, ids);
    }
    datesBySeason.set(week.seasonId, dates);
  }
  const postseason = (week: Row) =>
    week.weekType === "PO" || week.isPlayoffs === true;
  const participants = new Map<string, Set<string>>();
  const lastPostseasonStart = new Map<string, string>();
  if (input.matchups !== undefined) {
    for (const [matchupId, matchup] of inventory(input.matchups, "matchup")) {
      const week =
        typeof matchup.weekId === "string"
          ? weeks.get(matchup.weekId)
          : undefined;
      const home =
        typeof matchup.homeTeamId === "string"
          ? teams.get(matchup.homeTeamId)
          : undefined;
      const away =
        typeof matchup.awayTeamId === "string"
          ? teams.get(matchup.awayTeamId)
          : undefined;
      if (
        !week ||
        !home ||
        !away ||
        home === away ||
        week.seasonId !== matchup.seasonId ||
        home.seasonId !== matchup.seasonId ||
        away.seasonId !== matchup.seasonId
      ) {
        invalidReferences.push({
          kind: "matchup-season-week-team",
          id: matchupId,
        });
        continue;
      }
      if (!postseason(week)) continue;
      const bounds = weekBounds.get(matchup.weekId as string);
      if (!bounds) continue;
      const playing =
        participants.get(matchup.weekId as string) ?? new Set<string>();
      for (const teamId of [
        matchup.homeTeamId,
        matchup.awayTeamId,
      ] as string[]) {
        playing.add(teamId);
        const k = key(matchup.seasonId as string, teamId);
        if ((lastPostseasonStart.get(k) ?? "") < bounds.start)
          lastPostseasonStart.set(k, bounds.start);
      }
      participants.set(matchup.weekId as string, playing);
    }
    for (const [weekId, week] of weeks) {
      const bounds = weekBounds.get(weekId);
      if (
        postseason(week) &&
        bounds &&
        bounds.start <= input.cutoff &&
        !participants.has(weekId)
      )
        calendarIssues.push({
          kind: "postseason-week-without-matchups",
          id: weekId,
          seasonId: week.seasonId as string,
        });
    }
  }
  const expectsRoster = (seasonId: string, teamId: string, weekIds: string[]) =>
    input.matchups === undefined ||
    weekIds.some((weekId) => {
      const week = weeks.get(weekId)!;
      const playing = participants.get(weekId);
      // A missing entire bracket week is uncertain, not proof all teams exited.
      if (!postseason(week) || !playing?.size || playing.has(teamId))
        return true;
      // A team returning in a later round may have a bye in this week.
      return (
        (lastPostseasonStart.get(key(seasonId, teamId)) ?? "") >
        weekBounds.get(weekId)!.start
      );
    });
  const activeCategories = new Map<string, Set<string>>();
  for (const [seasonId, season] of seasons) {
    if (
      Array.isArray(season.categories) &&
      season.categories.every((c) => typeof c === "string")
    )
      activeCategories.set(seasonId, new Set(season.categories as string[]));
    else categoryPolicyUnknownSeasons.push(seasonId);
    const dates = datesBySeason.get(seasonId);
    const start = playerDayCalendarDate(season.startDate),
      end = playerDayCalendarDate(season.endDate);
    if (!start || !end || end < start)
      calendarIssues.push({ kind: "invalid-season-bounds", seasonId });
    if (!dates?.size) {
      if (
        start &&
        start <= input.cutoff &&
        [...teams.values()].some((t) => t.seasonId === seasonId)
      )
        calendarIssues.push({ kind: "missing-season-calendar", seasonId });
      continue;
    }
    const ordered = [...dates.keys()].sort();
    for (const date of ordered)
      if (dates.get(date)!.length > 1)
        calendarIssues.push({ kind: "overlapping-weeks", seasonId, date });
    for (let date = ordered[0]!; date <= ordered.at(-1)!; date = shift(date, 1))
      if (!dates.has(date))
        calendarIssues.push({ kind: "internal-calendar-gap", seasonId, date });
    // Week dates remain authoritative: historical season metadata can disagree.
    if (start && end && (ordered[0]! < start || ordered.at(-1)! > end))
      calendarIssues.push({
        kind: "season-week-boundary-disagreement",
        seasonId,
      });
    if (![...teams.values()].some((t) => t.seasonId === seasonId))
      calendarIssues.push({ kind: "active-season-without-teams", seasonId });
  }
  const duplicates: Array<{
    seasonId: string;
    playerId: string;
    date: string;
    ids: string[];
    teamIds: string[];
  }> = [];
  const identityGroups = new Map<
    string,
    {
      seasonId: string;
      playerId: string;
      date: string;
      ids: string[];
      teamIds: string[];
    }
  >();
  const teamDates = new Map<string, Set<string>>(),
    validRowsBySeason = new Map<string, number>();
  const seenRowIds = new Set<string>(),
    statHoles: Issue[] = [],
    invalidStats: Issue[] = [],
    supportFieldHoles: Issue[] = [];
  const hiddenInactiveFields: Record<string, number> = {};
  let scannedRows = 0,
    eligibleRows = 0,
    excludedFutureRows = 0,
    noGameRows = 0,
    unknownGameStatusRows = 0,
    playedRows = 0;
  for (const row of input.rows) {
    scannedRows++;
    const rowId = id(row);
    const date =
      typeof row.date === "string" &&
      row.date.length === 10 &&
      playerDayCalendarDate(row.date) === row.date
        ? row.date
        : null;
    if (!date) {
      invalidReferences.push({
        kind: "invalid-row-day-key",
        ...(rowId ? { id: rowId } : {}),
      });
      continue;
    }
    if (date > input.cutoff) {
      excludedFutureRows++;
      continue;
    }
    const issues: string[] = [];
    if (!rowId || seenRowIds.has(rowId))
      issues.push("invalid-or-duplicate-row-identity");
    if (rowId) seenRowIds.add(rowId);
    const season =
      typeof row.seasonId === "string" ? seasons.get(row.seasonId) : undefined;
    const team =
      typeof row.gshlTeamId === "string"
        ? teams.get(row.gshlTeamId)
        : undefined;
    const week =
      typeof row.weekId === "string" ? weeks.get(row.weekId) : undefined;
    if (!season) issues.push("row-season");
    if (!team || team.seasonId !== row.seasonId) issues.push("row-team-season");
    if (!week || week.seasonId !== row.seasonId) issues.push("row-week-season");
    const bounds =
      typeof row.weekId === "string" ? weekBounds.get(row.weekId) : undefined;
    if (!bounds || date < bounds.start || date > bounds.end)
      issues.push("row-week-date");
    if (
      typeof row.playerId !== "string" ||
      !row.playerId ||
      row.playerId.trim() !== row.playerId ||
      (players && !players.has(row.playerId))
    )
      issues.push("row-player");
    for (const kind of issues)
      invalidReferences.push({ kind, ...(rowId ? { id: rowId } : {}), date });
    if (issues.length) continue;
    const seasonId = row.seasonId as string,
      teamId = row.gshlTeamId as string,
      playerId = row.playerId as string;
    eligibleRows++;
    validRowsBySeason.set(seasonId, (validRowsBySeason.get(seasonId) ?? 0) + 1);
    const groupKey = key(seasonId, playerId, date);
    const group = identityGroups.get(groupKey) ?? {
      seasonId,
      playerId,
      date,
      ids: [],
      teamIds: [],
    };
    group.ids.push(rowId!);
    group.teamIds.push(teamId);
    identityGroups.set(groupKey, group);
    const td = key(teamId, date),
      roster = teamDates.get(td) ?? new Set<string>();
    roster.add(playerId);
    teamDates.set(td, roster);
    const context = { id: rowId!, seasonId, teamId, date };
    if (!["F", "D", "G"].includes(String(row.posGroup))) {
      invalidStats.push({ ...context, kind: "unknown-position-group" });
      continue;
    }
    const gp = number(row.GP);
    if (gp === null) {
      unknownGameStatusRows++;
      if (!missing(row.GP))
        invalidStats.push({ ...context, kind: "invalid-GP" });
      continue;
    }
    if (!Number.isInteger(gp) || gp < 0) {
      invalidStats.push({ ...context, kind: "invalid-GP" });
      continue;
    }
    if (gp === 0) {
      noGameRows++;
      continue;
    }
    playedRows++;
    const categories = activeCategories.get(seasonId),
      role = row.posGroup === "G" ? GOALIE : SKATER;
    const required = role.filter((field) => categories?.has(field));
    const absent: string[] = [],
      invalid: string[] = [];
    for (const field of role) {
      if (categories && !categories.has(field) && missing(row[field]))
        hiddenInactiveFields[field] = (hiddenInactiveFields[field] ?? 0) + 1;
    }
    for (const field of required) {
      if (
        field === "SVP" &&
        missing(row.SVP) &&
        number(row.SA) === 0 &&
        number(row.SV) === 0
      )
        continue;
      if (field === "GAA" && row.GAA === null && number(row.TOI) === 0)
        continue;
      if (missing(row[field])) absent.push(field);
      else if (
        number(row[field]) === null ||
        (field !== "PM" && number(row[field])! < 0) ||
        (!["GAA", "SVP"].includes(field) &&
          !Number.isInteger(number(row[field])))
      )
        invalid.push(field);
    }
    if (absent.length)
      statHoles.push({
        ...context,
        kind: "active-category-fields",
        fields: absent,
      });
    if (invalid.length)
      invalidStats.push({
        ...context,
        kind: "invalid-active-category-values",
        fields: invalid,
      });
    const supportMissing = (row.posGroup === "G" ? SUPPORT : ["TOI"]).filter(
      (field) => missing(row[field]),
    );
    if (supportMissing.length)
      supportFieldHoles.push({
        ...context,
        kind: "source-support-fields-unverified",
        fields: supportMissing,
      });
  }
  for (const group of identityGroups.values())
    if (group.ids.length > 1) duplicates.push(group);
  const missingTeamDates: Array<{
    seasonId: string;
    teamId: string;
    date: string;
    weekIds: string[];
  }> = [];
  const rosterCountFlags: PlayerDayRosterCountFlag[] = [];
  const inactivePostseasonTeamDates: Array<{
    seasonId: string;
    teamId: string;
    date: string;
    weekIds: string[];
    storedCount: number;
  }> = [];
  const summaries = [...seasons.keys()].map((seasonId) => {
    const dates = datesBySeason.get(seasonId) ?? new Map<string, string[]>();
    const teamIds = [...teams]
      .filter(([, team]) => team.seasonId === seasonId)
      .map(([teamId]) => teamId);
    const spots = seasons.get(seasonId)!.rosterSpots;
    const slots =
      Array.isArray(spots) &&
      spots.length &&
      spots.every((s) => typeof s === "string" && s.trim())
        ? spots.map((s) =>
            (s as string)
              .toUpperCase()
              .replace(/\+/g, "PLUS")
              .replace(/[\s_-]/g, ""),
          )
        : null;
    const reserve = (slot: string) =>
      ["IR", "IRPLUS", "IL", "ILPLUS", "NA"].includes(slot);
    const expectedRegularCapacity = slots
      ? slots.filter((slot) => !reserve(slot)).length
      : null;
    const startingCapacity = slots
      ? slots.filter(
          (slot) => !reserve(slot) && !["BN", "BENCH"].includes(slot),
        ).length
      : null;
    const maximumCapacity = slots ? slots.length : null;
    const minimum =
      input.minimumRosterCount ??
      (expectedRegularCapacity === null
        ? null
        : Math.max(0, expectedRegularCapacity - MIN_ROSTER_SHORTFALL + 1));
    let covered = 0,
      expected = 0,
      inactive = 0;
    for (const teamId of teamIds)
      for (const [date, weekIds] of dates) {
        const count = teamDates.get(key(teamId, date))?.size ?? 0;
        if (!expectsRoster(seasonId, teamId, weekIds)) {
          inactivePostseasonTeamDates.push({
            seasonId,
            teamId,
            date,
            weekIds: [...weekIds],
            storedCount: count,
          });
          inactive++;
          continue;
        }
        expected++;
        if (!count)
          missingTeamDates.push({
            seasonId,
            teamId,
            date,
            weekIds: [...weekIds],
          });
        else covered++;
        const countAt = (otherDate: string) =>
          dates.has(otherDate) &&
          expectsRoster(seasonId, teamId, dates.get(otherDate)!)
            ? (teamDates.get(key(teamId, otherDate))?.size ?? 0)
            : null;
        const neighbors = [-3, -2, -1, 1, 2, 3]
          .map((n) => countAt(shift(date, n)))
          .filter((c): c is number => c !== null);
        const nearbyMaximumCount = neighbors.length
          ? Math.max(...neighbors)
          : null;
        const nearbyCountDrop = Math.max(
          0,
          (nearbyMaximumCount ?? count) - count,
        );
        const countShortfall =
          expectedRegularCapacity === null
            ? null
            : Math.max(0, expectedRegularCapacity - count);
        const undersized =
          countShortfall !== null && countShortfall >= MIN_ROSTER_SHORTFALL;
        const reasons: string[] = [];
        if (!count)
          reasons.push(
            "No valid stored roster rows for this expected team date.",
          );
        if (undersized && startingCapacity !== null && count < startingCapacity)
          reasons.push(
            "Stored roster count is below configured starting lineup capacity.",
          );
        if (undersized)
          reasons.push(
            "Stored roster count is at least two below configured regular capacity, including bench and excluding optional reserve slots.",
          );
        if (nearbyCountDrop >= MIN_NEARBY_ROSTER_DROP)
          reasons.push(
            "Stored roster count is at least five below a date within three calendar days; transactions or reserve changes may explain the difference.",
          );
        if (minimum !== null && count < minimum && reasons.length === 0)
          reasons.push(
            "Stored roster count is below the explicitly configured review threshold.",
          );
        if (reasons.length) {
          const reviewSeverity = !count
            ? "missing-team-date"
            : undersized &&
                startingCapacity !== null &&
                count < startingCapacity
              ? "below-starting-capacity"
              : undersized
                ? "below-regular-capacity"
                : nearbyCountDrop >= MIN_NEARBY_ROSTER_DROP
                  ? "nearby-count-drop"
                  : "below-review-threshold";
          rosterCountFlags.push({
            seasonId,
            teamId,
            date,
            count,
            expectedRegularCapacity,
            startingCapacity,
            maximumCapacity,
            countShortfall,
            previousDateCount: countAt(shift(date, -1)),
            nextDateCount: countAt(shift(date, 1)),
            nearbyMaximumCount,
            nearbyCountDrop,
            reviewSeverity,
            reasons,
          });
        }
      }
    return {
      seasonId,
      teams: teamIds.length,
      calendarDates: dates.size,
      calendarTeamDates: teamIds.length * dates.size,
      expectedTeamDates: expected,
      inactivePostseasonTeamDates: inactive,
      coveredTeamDates: covered,
      eligibleRows: validRowsBySeason.get(seasonId) ?? 0,
      lowRosterReviewThreshold: minimum,
      expectedRegularCapacity,
      startingCapacity,
      maximumCapacity,
    };
  });
  const hardCalendarIssues = calendarIssues.filter(
    (i) => i.kind !== "season-week-boundary-disagreement",
  );
  return {
    version: "player-day-completeness-v2" as const,
    postseasonParticipationCheck:
      input.matchups === undefined ? "not-supplied" : "matchups-supplied",
    cutoff: input.cutoff,
    playerReferenceCheck:
      players === null
        ? ("not-supplied" as const)
        : ("complete-inventory-supplied" as const),
    categoryPolicyUnknownSeasons,
    scannedRows,
    eligibleRows,
    excludedFutureRows,
    playedRows,
    noGameRows,
    unknownGameStatusRows,
    summaries,
    missingTeamDates,
    inactivePostseasonTeamDates,
    lowRosterTeamDates: rosterCountFlags.filter(
      (flag) =>
        flag.count > 0 &&
        flag.countShortfall !== null &&
        flag.countShortfall >= MIN_ROSTER_SHORTFALL,
    ),
    rosterCountFlags,
    duplicates,
    invalidReferences,
    calendarIssues,
    statHoles,
    invalidStats,
    supportFieldHoles,
    hiddenInactiveFields,
    hardFaults:
      missingTeamDates.length +
      duplicates.length +
      invalidReferences.length +
      hardCalendarIssues.length +
      statHoles.length +
      invalidStats.length,
    limitations: [
      "Nonempty or small rosters cannot establish exact roster completeness without an independent dated roster source.",
      "Roster counts are distinct valid player IDs per team date. Regular capacity includes bench and excludes IR/IRPlus; lower counts and three-day count drops are review signals, not proof that named players are missing.",
      "Unknown or zero GP is not evidence of a missing played-game stat line.",
      "Inactive-category nulls are storage policy; support-field holes are separate diagnostics, not active-category faults.",
      "Only supplied fantasy weeks define active dates; calendar gaps/missing calendars prevent an assertion of full coverage.",
      "Postseason expectations use recorded matchups, including LT/consolation games and later-round byes. No current or later postseason matchup means inactive; an entirely missing bracket week remains uncertain.",
      ...(input.matchups === undefined
        ? [
            "No complete matchup inventory was supplied, so postseason inactivity exemptions were not applied.",
          ]
        : []),
      ...(players === null
        ? [
            "Canonical player references were not independently checked because no full player inventory was supplied.",
          ]
        : []),
    ],
  };
}
