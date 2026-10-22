/** Source identity only: this helper neither prices penalties nor changes events.
 * Callers must independently establish roster actors and extract the offence
 * label (without names, zone, served-by or drawn-by text) from official rows. */
type Identity = {
  period: number;
  second: number;
  teamId: number;
  committedByPlayerId: number | null;
  servedByPlayerId?: number | null;
  duration: number;
  typeCode: string;
  offence: string;
};
export type HistoricalNativePenaltyIdentity = Identity & {
  eventId: number;
  sortOrder: number;
};
export type HistoricalReportPenaltyIdentity = Identity & { ordinal: number };
// The same NHL offence has these explicit printed/API spellings.
const offenceAliases: Record<string, string> = {
  histicking: "highsticking",
  interferenceongoalkeeper: "interferencegoalkeeper",
  faceoffviolation: "delayinggamebenchfaceoffviolation",
  delayofgame: "delayinggame",
  matchpenatlyminutes: "matchpenalty",
  histickdoubleminor: "highstickingdoubleminor",
};
const normalizeOffence = (value: string) => {
  const key = value.toLowerCase().replace(/[^a-z]/g, "");
  return offenceAliases[key] ?? key;
};
function validateIdentity(value: Identity) {
  if (
    !Number.isInteger(value.period) ||
    value.period < 1 ||
    !Number.isInteger(value.second) ||
    value.second < 0 ||
    value.second > (value.period <= 3 ? 1200 : 300) ||
    !Number.isInteger(value.teamId) ||
    value.teamId <= 0 ||
    (value.committedByPlayerId !== null &&
      (!Number.isInteger(value.committedByPlayerId) ||
        value.committedByPlayerId <= 0)) ||
    (value.servedByPlayerId !== undefined &&
      value.servedByPlayerId !== null &&
      (!Number.isInteger(value.servedByPlayerId) ||
        value.servedByPlayerId <= 0)) ||
    !Number.isInteger(value.duration) ||
    value.duration < 0 ||
    value.duration > 20 ||
    !/^[A-Z][A-Z-]{1,7}$/.test(value.typeCode) ||
    !normalizeOffence(value.offence)
  )
    throw Error("Invalid historical penalty identity");
}

/** Match an entire same-clock/team/committer group. Distinct type, duration and
 * offence can establish unique identities; sorted source order alone cannot.
 * Identical repeated minors remain explicitly ambiguous. A separate reviewed
 * exchangeability/order policy would be necessary before consuming such groups. */
export function alignHistoricalPenaltyGroup(
  native: readonly HistoricalNativePenaltyIdentity[],
  official: readonly HistoricalReportPenaltyIdentity[],
) {
  if (!native.length || native.length > 20 || official.length > 20)
    throw Error("Historical penalty group must contain 1..20 native events");
  for (const row of [...native, ...official]) validateIdentity(row);
  const first = native[0]!;
  if (
    [...native, ...official].some(
      (row) =>
        row.period !== first.period ||
        row.second !== first.second ||
        row.teamId !== first.teamId ||
        row.committedByPlayerId !== first.committedByPlayerId,
    ) ||
    native.some(
      (row) =>
        !Number.isInteger(row.eventId) ||
        row.eventId < 1 ||
        !Number.isInteger(row.sortOrder) ||
        row.sortOrder < 0,
    ) ||
    official.some((row) => !Number.isInteger(row.ordinal) || row.ordinal < 1) ||
    new Set(native.map((row) => row.eventId)).size !== native.length ||
    new Set(native.map((row) => row.sortOrder)).size !== native.length ||
    new Set(official.map((row) => row.ordinal)).size !== official.length
  )
    throw Error("Mixed or duplicate historical penalty group");
  const candidates = official.map((row) =>
    native.flatMap((candidate, index) =>
      candidate.typeCode === row.typeCode &&
      candidate.duration === row.duration &&
      normalizeOffence(candidate.offence) === normalizeOffence(row.offence) &&
      // Unknown native server metadata cannot prove or disprove a server join.
      // In particular it cannot resolve otherwise identical native minors.
      (candidate.servedByPlayerId === undefined ||
        row.servedByPlayerId === undefined ||
        candidate.servedByPlayerId === row.servedByPlayerId)
        ? [index]
        : [],
    ),
  );
  const groups = official.map((row, index) => ({
    ordinal: row.ordinal,
    candidateEventIds: candidates[index]!.map((i) => native[i]!.eventId),
  }));
  if (native.length !== official.length || candidates.some((c) => !c.length))
    return { status: "unmatched" as const, matches: [], groups };
  // Polynomial bipartite matching avoids factorial work on a deficient group.
  // Removing each matched edge checks uniqueness, rather than using source order
  // to choose between indistinguishable solutions.
  const order = candidates
    .map((values, index) => ({ values, index }))
    .sort((a, b) => a.values.length - b.values.length || a.index - b.index);
  const perfectMatching = (forbidden?: { row: number; native: number }) => {
    const matched = Array<number>(native.length).fill(-1);
    const augment = (row: number, visited: Set<number>): boolean => {
      for (const index of candidates[row]!) {
        if (
          visited.has(index) ||
          (forbidden?.row === row && forbidden.native === index)
        )
          continue;
        visited.add(index);
        if (matched[index] === -1 || augment(matched[index]!, visited)) {
          matched[index] = row;
          return true;
        }
      }
      return false;
    };
    for (const entry of order)
      if (!augment(entry.index, new Set())) return null;
    return new Map(matched.map((row, index) => [row, index]));
  };
  const solution = perfectMatching();
  if (!solution) return { status: "unmatched" as const, matches: [], groups };
  for (const [row, index] of solution)
    if (perfectMatching({ row, native: index }))
      return { status: "ambiguous" as const, matches: [], groups };
  return {
    status: "unique" as const,
    matches: official.map((row, index) => ({
      ordinal: row.ordinal,
      eventId: native[solution.get(index)!]!.eventId,
    })),
    groups,
  };
}

function sourceRecord(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw Error("Historical penalty source must be a plain object");
  return value as Record<string, unknown>;
}
function canonicalSource(value: unknown): string {
  const canonical = (item: unknown): unknown => {
    if (item === null || typeof item === "string" || typeof item === "boolean")
      return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (Array.isArray(item)) return item.map(canonical);
    const record = sourceRecord(item);
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonical(record[key])]),
    );
  };
  return JSON.stringify(canonical(value));
}

function nativePenaltyRecord(raw: unknown) {
  const event = sourceRecord(raw),
    period = sourceRecord(event.periodDescriptor),
    details = sourceRecord(event.details);
  const clock = String(event.timeInPeriod).match(/^(\d{1,2}):([0-5]\d)$/);
  if (event.typeDescKey !== "penalty" || !clock)
    throw Error("Model-equivalent group requires raw native penalties");
  const identity: HistoricalNativePenaltyIdentity = {
    eventId: event.eventId as number,
    sortOrder: event.sortOrder as number,
    period: period.number as number,
    second: Number(clock[1]) * 60 + Number(clock[2]),
    teamId: details.eventOwnerTeamId as number,
    committedByPlayerId: (details.committedByPlayerId ?? null) as number | null,
    ...(details.servedByPlayerId === undefined
      ? {}
      : { servedByPlayerId: details.servedByPlayerId as number | null }),
    typeCode: details.typeCode as string,
    duration: details.duration as number,
    offence: details.descKey as string,
  };
  const payload = { ...event };
  delete payload.eventId;
  delete payload.sortOrder;
  return { identity, raw: event, fingerprint: canonicalSource(payload) };
}

/** A separate, explicitly ambiguous authority. This proves a serialization
 * choice cannot change the CURRENT native model input; it does not discover
 * primary event identities. Full raw payloads must be equal except their two
 * top-level ID/order fields. Report server/manpower/lineup differences are kept
 * as evidence and MUST NOT be copied into these ambiguous native events.
 *
 * The source bridge must independently establish complete same-clock original
 * native/report groups. Other actors may intervene; neither metadata nor
 * identity is inferred from the resulting serialization slots. */
export function reviewModelEquivalentPenaltyGroup(
  rawNative: readonly unknown[],
  official: readonly (HistoricalReportPenaltyIdentity & {
    semantics: Readonly<Record<string, unknown>>;
  })[],
) {
  const native = rawNative.map(nativePenaltyRecord);
  for (const row of official) canonicalSource(row.semantics);
  const alignment = alignHistoricalPenaltyGroup(
    native.map((row) => row.identity),
    official,
  );
  const ordered = [...official].sort((a, b) => a.ordinal - b.ordinal);
  const inNativeOrder = [...native].sort(
    (a, b) => a.identity.sortOrder - b.identity.sortOrder,
  );
  if (
    native.length < 2 ||
    alignment.status !== "ambiguous" ||
    native.length !== official.length ||
    new Set(native.map((row) => row.fingerprint)).size !== 1 ||
    alignment.groups.some(
      (row) => row.candidateEventIds.length !== native.length,
    ) ||
    // Other actors may have intervening same-whistle rows. Only full payload
    // equality establishes exchangeability; contiguity cannot establish it.
    new Set(inNativeOrder.map((row) => row.identity.sortOrder)).size !==
      native.length
  )
    return {
      accepted: false as const,
      status: "unresolved" as const,
      matches: [],
      alignment,
    };
  return {
    accepted: true as const,
    status: "model-equivalent-ambiguous" as const,
    matches: [],
    nativePayloads: inNativeOrder.map((row) => structuredClone(row.raw)),
    nativeComparablePayload: JSON.parse(
      inNativeOrder[0]!.fingerprint,
    ) as unknown,
    ordinalSlots: inNativeOrder.map((row, index) => ({
      nativeEventId: row.identity.eventId,
      originalNativeSortOrder: row.identity.sortOrder,
      reportOrdinal: ordered[index]!.ordinal,
      identity: "serialization-only-not-primary-event-identity" as const,
    })),
    reportRows: ordered.map((row) => structuredClone(row)),
    reportSemanticsDiffer:
      new Set(ordered.map((row) => canonicalSource(row.semantics))).size > 1,
    candidateEventIds: inNativeOrder.map((row) => row.identity.eventId),
    interpretation:
      "Full native payloads and their original ID order are preserved. Ordinal slots serialize observationally identical native events only; report server, strength, lineup and other ambiguous metadata are not copied. This is not a unique primary-source identity match.",
  };
}

/** Connected components are anchored by the FULL compatibility graph. Nothing
 * is accepted unless every native/report member belongs to an approved equal-
 * cardinality component. Unique edges identify events; ambiguous components
 * require identical full native payloads and never acquire report metadata. */
export function reviewPartitionedHistoricalPenaltyGroup(
  rawNative: readonly unknown[],
  official: readonly (HistoricalReportPenaltyIdentity & {
    semantics: Readonly<Record<string, unknown>>;
  })[],
) {
  const native = rawNative.map(nativePenaltyRecord);
  const alignment = alignHistoricalPenaltyGroup(
    native.map((row) => row.identity),
    official,
  );
  const unresolved = { accepted: false as const, alignment };
  if (alignment.status !== "ambiguous") return unresolved;
  const pending = new Set(official.map((row) => row.ordinal));
  const coveredNative = new Set<number>();
  const partitions: unknown[] = [];
  const ordinalSlots: Array<{
    nativeEventId: number;
    reportOrdinal: number;
    identity: string;
  }> = [];
  while (pending.size) {
    const ordinals = new Set([pending.values().next().value!]);
    const ids = new Set<number>();
    let changed = true;
    while (changed) {
      const before = ordinals.size + ids.size;
      for (const row of alignment.groups) {
        if (
          ordinals.has(row.ordinal) ||
          row.candidateEventIds.some((id) => ids.has(id))
        ) {
          ordinals.add(row.ordinal);
          for (const id of row.candidateEventIds) ids.add(id);
        }
      }
      changed = before !== ordinals.size + ids.size;
    }
    if (
      ids.size !== ordinals.size ||
      [...ids].some((id) => coveredNative.has(id))
    )
      return unresolved;
    const rawGroup = native.filter((r) => ids.has(r.identity.eventId));
    const reports = official.filter((r) => ordinals.has(r.ordinal));
    const component = alignHistoricalPenaltyGroup(
      rawGroup.map((r) => r.identity),
      reports,
    );
    if (component.status === "unique") {
      partitions.push({
        status: "unique",
        nativeEventIds: [...ids],
        reportRows: structuredClone(reports),
        alignment: component,
      });
      for (const match of component.matches)
        ordinalSlots.push({
          nativeEventId: match.eventId,
          reportOrdinal: match.ordinal,
          identity: "unique-primary-identity",
        });
    } else {
      const equivalent = reviewModelEquivalentPenaltyGroup(
        rawGroup.map((r) => r.raw),
        reports,
      );
      if (!equivalent.accepted) return unresolved;
      partitions.push(equivalent);
      ordinalSlots.push(...equivalent.ordinalSlots);
    }
    for (const ordinal of ordinals) pending.delete(ordinal);
    for (const id of ids) coveredNative.add(id);
  }
  if (
    coveredNative.size !== native.length ||
    ordinalSlots.length !== official.length ||
    new Set(ordinalSlots.map((s) => s.nativeEventId)).size !== native.length ||
    new Set(ordinalSlots.map((s) => s.reportOrdinal)).size !== official.length
  )
    return unresolved;
  return {
    accepted: true as const,
    status: "partitioned-unique-and-model-equivalent" as const,
    matches: [],
    ordinalSlots,
    partitions,
    interpretation:
      "All compatibility components approved together. Unique components retain actual identity; ambiguous components retain full identical native payloads and serialization-only identity. No partial matching or report-metadata assignment.",
  };
}
