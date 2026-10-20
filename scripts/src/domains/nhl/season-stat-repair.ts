type Row = Record<string, unknown>;

export type NhlSeasonStatRepairOperation =
  | {
      kind: "patch";
      id: string;
      expectedRow: Row;
      playerId: string;
      nhlPlayerId: number;
      fields: Row;
    }
  | { kind: "insert"; playerId: string; nhlPlayerId: number; document: Row }
  | { kind: "delete"; id: string; expectedRow: Row; reason: string };

const writableFields = new Set([
  "GP",
  "GS",
  "G",
  "A",
  "P",
  "PM",
  "PIM",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
  "W",
  "GA",
  "GAA",
  "SV",
  "SA",
  "SVP",
  "SO",
  "QS",
  "RBS",
  "TOI",
  "nhlPos",
  "posGroup",
  "nhlTeam",
  "age",
  "seasonRating",
]);
const integerFields = new Set([
  "GP",
  "GS",
  "G",
  "A",
  "P",
  "PM",
  "PIM",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
  "W",
  "GA",
  "SV",
  "SA",
  "SO",
  "QS",
  "RBS",
]);
const skaterRequired = [
  "GP",
  "G",
  "A",
  "P",
  "PM",
  "PIM",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
  "TOI",
];
const goalieRequired = [
  "GP",
  "GS",
  "W",
  "GA",
  "GAA",
  "SV",
  "SA",
  "SVP",
  "SO",
  "TOI",
];

function numeric(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim()))
    return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function positiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function rowId(row: Row): string {
  const id = row._id ?? row.id;
  if (typeof id !== "string" || !id)
    throw Error("Existing stat line has no canonical row ID");
  return id;
}
function safeFields(fields: Row): Row {
  const result = structuredClone(
    Object.fromEntries(
      Object.entries(fields).filter(([key]) => writableFields.has(key)),
    ),
  );
  if (!["F", "D", "G"].includes(String(result.posGroup)))
    throw Error("Desired stat line requires a known F/D/G role");
  for (const field of ["nhlPos", "nhlTeam"]) {
    const value = result[field];
    if (
      !Array.isArray(value) ||
      !value.length ||
      value.some((item) => typeof item !== "string" || !item.trim())
    )
      throw Error(`Desired stat line requires complete ${field}`);
  }
  const required = result.posGroup === "G" ? goalieRequired : skaterRequired;
  for (const field of [...required, "seasonRating"]) {
    if (
      field === "SVP" &&
      result.SVP === null &&
      numeric(result.SA) === 0 &&
      numeric(result.SV) === 0
    )
      continue;
    const value = numeric(result[field]);
    if (
      value === null ||
      (integerFields.has(field) && !Number.isInteger(value)) ||
      (field !== "PM" && value < 0)
    )
      throw Error(`Desired stat line has invalid required ${field}`);
  }
  if (Number(result.GP) <= 0)
    throw Error("Desired NHL population must contain only positive-GP players");
  for (const field of integerFields) {
    if (result[field] === undefined || result[field] === null) continue;
    const value = numeric(result[field]);
    if (
      value === null ||
      !Number.isInteger(value) ||
      (field !== "PM" && value < 0)
    )
      throw Error(`Invalid counting field ${field}`);
  }
  for (const field of ["GAA", "SVP"]) {
    if (
      result[field] !== undefined &&
      result[field] !== null &&
      (numeric(result[field]) === null || Number(result[field]) < 0)
    )
      throw Error(`Invalid rate field ${field}`);
  }
  return result;
}

/**
 * The caller must bind desired populations and reviewed-source identities to an
 * independently verified official source and backup. This function never infers
 * identity from names, decides source completeness, or authorizes deletion.
 */
export function planNhlSeasonStatRepair(input: {
  seasonId: string;
  existingRows: readonly Row[];
  desired: readonly { playerId: string; nhlPlayerId: number; fields: Row }[];
  playerNhlIds: ReadonlyMap<string, number>;
}) {
  if (!input.seasonId) throw Error("Explicit season ID required");
  const desiredByNhl = new Map<
    number,
    { playerId: string; nhlPlayerId: number; fields: Row }
  >();
  const desiredPlayers = new Set<string>();
  for (const wanted of input.desired) {
    if (
      !wanted.playerId ||
      !positiveId(wanted.nhlPlayerId) ||
      desiredByNhl.has(wanted.nhlPlayerId) ||
      desiredPlayers.has(wanted.playerId)
    )
      throw Error(
        "Desired population contains invalid or duplicate player/NHL identities",
      );
    desiredPlayers.add(wanted.playerId);
    desiredByNhl.set(wanted.nhlPlayerId, {
      ...wanted,
      fields: safeFields(wanted.fields),
    });
  }
  for (const [reference, id] of input.playerNhlIds)
    if (!reference || !positiveId(id))
      throw Error("Invalid validated player identity map");
  const groups = new Map<number, Row[]>();
  const deletions: Extract<NhlSeasonStatRepairOperation, { kind: "delete" }>[] =
    [];
  const ids = new Set<string>();
  for (const row of input.existingRows) {
    const id = rowId(row);
    if (row.seasonId !== input.seasonId || ids.has(id))
      throw Error("Mixed-season or duplicate existing stat-line IDs");
    ids.add(id);
    const games = numeric(row.GP);
    if (games === null)
      throw Error(`Unknown GP prevents safe reconciliation of ${id}`);
    if (games <= 0) {
      deletions.push({
        kind: "delete",
        id,
        expectedRow: structuredClone(row),
        reason:
          "Unplayed NHL season row: GP is non-positive; official desired population contains played players only",
      });
      continue;
    }
    const hockey = row.hockeyRating;
    let nhlId: number | undefined;
    if (
      hockey &&
      typeof hockey === "object" &&
      "identityResolution" in hockey &&
      hockey.identityResolution === "reviewed-source"
    ) {
      const reviewed = hockey as Row;
      if (
        reviewed.modelVersion !== "nhl-hockey-overall-reviewed-v1" ||
        !positiveId(reviewed.nhlPlayerId) ||
        typeof reviewed.sourceId !== "string" ||
        !reviewed.sourceId ||
        typeof reviewed.identityReviewHash !== "string" ||
        !/^[a-f0-9]{64}$/.test(reviewed.identityReviewHash) ||
        reviewed.sourceGames !== games
      )
        throw Error(
          `Invalid or stale reviewed-source identity evidence for ${id}`,
        );
      nhlId = reviewed.nhlPlayerId;
    } else {
      nhlId = input.playerNhlIds.get(String(row.playerId ?? ""));
    }
    if (!positiveId(nhlId))
      throw Error(
        `Unresolved positive-GP NHL identity for ${id}; explicit reviewed mapping required`,
      );
    if (!desiredByNhl.has(nhlId)) {
      if (!input.desired.length)
        throw Error(
          "An empty desired population cannot prove positive-GP rows are nonofficial",
        );
      deletions.push({
        kind: "delete",
        id,
        expectedRow: structuredClone(row),
        reason: `Known NHL player ${nhlId} is absent from the complete verified official played-player population for this season`,
      });
      continue;
    }
    const bucket = groups.get(nhlId) ?? [];
    bucket.push(row);
    groups.set(nhlId, bucket);
  }
  const changes: NhlSeasonStatRepairOperation[] = [];
  for (const wanted of [...desiredByNhl.values()].sort(
    (a, b) => a.nhlPlayerId - b.nhlPlayerId,
  )) {
    const candidates = [...(groups.get(wanted.nhlPlayerId) ?? [])].sort(
      (a, b) => {
        const canonical =
          Number(b.playerId === wanted.playerId) -
          Number(a.playerId === wanted.playerId);
        if (canonical) return canonical;
        const time = (row: Row) =>
          numeric(row._creationTime) ??
          numeric(row.createdAt) ??
          Number.MAX_VALUE;
        const age = time(a) - time(b);
        return age || rowId(a).localeCompare(rowId(b));
      },
    );
    const keeper = candidates[0];
    if (keeper) {
      changes.push({
        kind: "patch",
        id: rowId(keeper),
        expectedRow: structuredClone(keeper),
        playerId: wanted.playerId,
        nhlPlayerId: wanted.nhlPlayerId,
        fields: structuredClone(wanted.fields),
      });
      for (const duplicate of candidates.slice(1))
        deletions.push({
          kind: "delete",
          id: rowId(duplicate),
          expectedRow: structuredClone(duplicate),
          reason: `Duplicate NHL season identity ${wanted.nhlPlayerId}; retain ${rowId(keeper)} with canonical player ${wanted.playerId}`,
        });
    } else {
      changes.push({
        kind: "insert",
        playerId: wanted.playerId,
        nhlPlayerId: wanted.nhlPlayerId,
        document: {
          seasonId: input.seasonId,
          playerId: wanted.playerId,
          ...structuredClone(wanted.fields),
        },
      });
    }
  }
  // Delete obsolete keys before inserting their corrected canonical population.
  const statOps: NhlSeasonStatRepairOperation[] = [
    ...deletions.sort((a, b) => a.id.localeCompare(b.id)),
    ...changes,
  ];
  return {
    seasonId: input.seasonId,
    statOps,
    counts: {
      patch: changes.filter((op) => op.kind === "patch").length,
      insert: changes.filter((op) => op.kind === "insert").length,
      delete: deletions.length,
      desired: input.desired.length,
    },
  };
}
