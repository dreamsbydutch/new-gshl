import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  aggregateSeasonStats,
  isStarter,
  parseSeasonCategories,
  type SeasonStatsAggregationResult,
} from "@gshl-lib/stats/season-stat-aggregation";
import {
  beginPlayerDayArchive,
  completePlayerDayDeletion,
  completePlayerDayRestore,
  configureConvexTarget,
  deleteVerifiedPlayerDayBatch,
  fetchAggregateRows,
  fetchModel,
  fetchRawPlayerDaySeason,
  fetchSeasonActivity,
  finalizePlayerDayArchive,
  getPlayerDayArchiveState,
  markPlayerDayArchiveFailed,
  preparePlayerDayDeletion,
  removeStalePlayerDayHighlights,
  upsertAggregateRows,
  upsertPlayerDayHighlights,
  type AggregateModelName,
} from "@gshl-lib/data/convex-store";
import type { DatabaseRecord } from "@gshl-lib/sheets/config/config";
import type { Season } from "@gshl-types";
import {
  PlayerDayArchiveDatabase,
  resolveArchiveDbPath,
  sha256,
  verifyPortableBackup,
  writePortableBackup,
  type ArchiveHighlight,
  type ArchiveManifest,
  type ArchiveRow,
} from "@gshl-lib/data/sqlite-player-day-archive";

type AnyRow = Record<string, unknown>;
export type ArchiveTarget = "development" | "production";
export type ArchiveOptions = {
  target: ArchiveTarget;
  seasonId?: string;
  allCompleted: boolean;
  apply: boolean;
  deleteSource: boolean;
  confirmSeasonId?: string;
  replaceExistingArchive: boolean;
};
export type RestoreOptions = {
  target: ArchiveTarget;
  seasonId: string;
  apply: boolean;
  confirmSeasonId?: string;
  replaceConflicts: boolean;
};

const ARCHIVE_VERSION = 1;
const LOWER_BETTER = new Set(["GAA", "GA"]);
const AGGREGATES: Array<{
  model: AggregateModelName;
  property: keyof SeasonStatsAggregationResult;
  keys: string[];
  seasonScoped: boolean;
}> = [
  {
    model: "PlayerWeekStatLine",
    property: "playerWeeks",
    keys: ["seasonId", "gshlTeamId", "playerId", "weekId"],
    seasonScoped: true,
  },
  {
    model: "PlayerSplitStatLine",
    property: "playerSplits",
    keys: ["seasonId", "seasonType", "gshlTeamId", "playerId"],
    seasonScoped: true,
  },
  {
    model: "PlayerTotalStatLine",
    property: "playerTotals",
    keys: ["seasonId", "seasonType", "playerId"],
    seasonScoped: true,
  },
  {
    model: "PlayerCareerSplitStatLine",
    property: "playerCareerSplits",
    keys: ["gshlTeamId", "playerId", "seasonType"],
    seasonScoped: false,
  },
  {
    model: "PlayerCareerTotalStatLine",
    property: "playerCareerTotals",
    keys: ["playerId", "seasonType"],
    seasonScoped: false,
  },
  {
    model: "TeamDayStatLine",
    property: "teamDays",
    keys: ["seasonId", "gshlTeamId", "weekId", "date"],
    seasonScoped: true,
  },
  {
    model: "TeamWeekStatLine",
    property: "teamWeeks",
    keys: ["seasonId", "weekId", "gshlTeamId"],
    seasonScoped: true,
  },
  {
    model: "TeamSeasonStatLine",
    property: "teamSeasons",
    keys: ["seasonId", "seasonType", "gshlTeamId"],
    seasonScoped: true,
  },
];
const METADATA_FIELDS = new Set([
  "id",
  "_id",
  "_creationTime",
  "legacyId",
  "createdAt",
  "updatedAt",
]);

function repoRoot(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../../",
  );
}

function toStringValue(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return Number.NaN;
  return Number(value);
}

export function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as AnyRow)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function sourceDocument(row: AnyRow): AnyRow {
  const source = { ...row };
  delete source.id;
  return source;
}

function sourceKey(row: AnyRow): string {
  return [row.seasonId, row.gshlTeamId, row.playerId, row.weekId, row.date]
    .map(toStringValue)
    .join("|");
}

function generatedSourceKey(row: AnyRow): string {
  return sourceKey(row);
}

export function prepareArchiveRows(rawRows: readonly AnyRow[]): {
  rows: ArchiveRow[];
  checksum: string;
  firstDate: string | null;
  lastDate: string | null;
} {
  const ids = new Set<string>();
  const keys = new Set<string>();
  const rows = rawRows
    .map((raw): ArchiveRow => {
      const row = sourceDocument(raw);
      const sourceId = toStringValue(row._id);
      const requiredKeyValues = [
        row.seasonId,
        row.gshlTeamId,
        row.playerId,
        row.weekId,
        row.date,
      ].map(toStringValue);
      const key = sourceKey(row);
      if (!sourceId || ids.has(sourceId))
        throw new Error(`Duplicate or missing source id: ${sourceId}`);
      if (requiredKeyValues.some((value) => !value))
        throw new Error(
          `Missing player-day composite key field for ${sourceId}`,
        );
      if (keys.has(key))
        throw new Error(`Duplicate player-day composite key: ${key}`);
      ids.add(sourceId);
      keys.add(key);
      const json = canonicalJson(row);
      return {
        sourceId,
        seasonId: toStringValue(row.seasonId),
        gshlTeamId: toStringValue(row.gshlTeamId),
        playerId: toStringValue(row.playerId),
        weekId: toStringValue(row.weekId),
        date: toStringValue(row.date),
        canonicalJson: json,
        rowChecksum: sha256(json),
      };
    })
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const dates = rows
    .map((row) => row.date)
    .filter(Boolean)
    .sort();
  return {
    rows,
    checksum: sha256(rows.map((row) => row.canonicalJson).join("\n")),
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
  };
}

function compareRating(left: AnyRow, right: AnyRow): number {
  return (
    toNumber(right.Rating) - toNumber(left.Rating) ||
    toStringValue(left.date).localeCompare(toStringValue(right.date)) ||
    toStringValue(left.playerId).localeCompare(toStringValue(right.playerId)) ||
    toStringValue(left.sourcePlayerDayId).localeCompare(
      toStringValue(right.sourcePlayerDayId),
    )
  );
}

export function selectPlayerDayHighlights(
  generatedRows: readonly DatabaseRecord[],
  rawRows: readonly AnyRow[],
  categories: readonly string[],
  archiveChecksum: string,
): AnyRow[] {
  const rawByKey = new Map(
    rawRows.map((row) => [sourceKey(row), sourceDocument(row)]),
  );
  const eligible: AnyRow[] = generatedRows
    .filter((row) => toStringValue(row.GP) === "1" && isStarter(row))
    .flatMap((generated) => {
      const raw = rawByKey.get(generatedSourceKey(generated));
      if (!raw) return [];
      return [
        {
          ...generated,
          sourcePlayerDayId: toStringValue(raw._id),
          sourceKey: sourceKey(raw),
          archiveChecksum,
          ratingRank: null,
          categoryRanks: [] as AnyRow[],
          selectionReasons: [] as string[],
        },
      ];
    });
  const selected = new Map<string, AnyRow>();
  eligible
    .filter(
      (row) =>
        Number.isFinite(toNumber(row.Rating)) && toNumber(row.Rating) > 0,
    )
    .sort(compareRating)
    .slice(0, 100)
    .forEach((row, index) => {
      row.ratingRank = index + 1;
      (row.selectionReasons as string[]).push(`rating:${index + 1}`);
      selected.set(toStringValue(row.sourcePlayerDayId), row);
    });
  for (const category of [...new Set(categories)]) {
    const ranked = eligible
      .filter((row) => {
        const value = toNumber(row[category]);
        if (!Number.isFinite(value)) return false;
        if (category === "GAA") return toNumber(row.TOI) > 0 && value >= 0;
        return LOWER_BETTER.has(category) ? value >= 0 : value > 0;
      })
      .sort((left, right) => {
        const valueDelta = LOWER_BETTER.has(category)
          ? toNumber(left[category]) - toNumber(right[category])
          : toNumber(right[category]) - toNumber(left[category]);
        return valueDelta || compareRating(left, right);
      })
      .slice(0, 10);
    ranked.forEach((candidate, index) => {
      const id = toStringValue(candidate.sourcePlayerDayId);
      const row = selected.get(id) ?? candidate;
      (row.categoryRanks as AnyRow[]).push({
        category,
        rank: index + 1,
        value: toNumber(candidate[category]),
      });
      (row.selectionReasons as string[]).push(
        `category:${category}:${index + 1}`,
      );
      selected.set(id, row);
    });
  }
  return [...selected.values()].sort((left, right) => {
    const leftRank = Number(left.ratingRank ?? Number.MAX_SAFE_INTEGER);
    const rightRank = Number(right.ratingRank ?? Number.MAX_SAFE_INTEGER);
    return leftRank - rightRank || compareRating(left, right);
  });
}

function keyFor(row: AnyRow, keys: readonly string[]): string {
  return keys.map((key) => toStringValue(row[key])).join("|");
}

function projection(row: AnyRow, fields: readonly string[]): AnyRow {
  return Object.fromEntries(
    fields.map((field) => [field, canonicalValue(row[field])]),
  );
}

async function verifyAggregateParity(
  seasonId: string,
  generated: SeasonStatsAggregationResult,
): Promise<Record<string, string>> {
  const checksums: Record<string, string> = {};
  for (const spec of AGGREGATES) {
    const generatedRows = generated[spec.property] as DatabaseRecord[];
    const liveRows = await fetchAggregateRows<DatabaseRecord>(
      spec.model,
      spec.seasonScoped ? seasonId : undefined,
    );
    const liveByKey = new Map<string, DatabaseRecord>();
    for (const row of liveRows) {
      const key = keyFor(row, spec.keys);
      if (liveByKey.has(key))
        throw new Error(`${spec.model} contains duplicate key ${key}`);
      liveByKey.set(key, row);
    }
    const normalized = generatedRows
      .map((row) => {
        const fields = Object.keys(row)
          .filter((field) => !METADATA_FIELDS.has(field))
          .sort();
        const live = liveByKey.get(keyFor(row, spec.keys));
        if (
          !live ||
          canonicalJson(projection(live, fields)) !==
            canonicalJson(projection(row, fields))
        ) {
          throw new Error(
            `${spec.model} aggregate drift at ${keyFor(row, spec.keys)}; run stats:aggregate-season --apply before archiving`,
          );
        }
        liveByKey.delete(keyFor(row, spec.keys));
        return canonicalJson(projection(row, fields));
      })
      .sort();
    if (liveByKey.size)
      throw new Error(
        `${spec.model} has ${liveByKey.size} stale live aggregate row(s)`,
      );
    checksums[spec.model] = sha256(normalized.join("\n"));
  }
  return checksums;
}

function validateCompletedSeason(season: Season): void {
  if (season.isActive) throw new Error(`Season ${season.id} is active`);
  const rawEnd = season.endDate as unknown;
  const end =
    rawEnd instanceof Date
      ? rawEnd.getTime()
      : Date.parse(String(rawEnd ?? ""));
  if (!Number.isFinite(end) || end >= Date.now())
    throw new Error(`Season ${season.id} is not completed`);
}

function resolveSeason(seasons: Season[], requested: string): Season {
  const season = seasons.find((row) =>
    [row.id, (row as unknown as AnyRow).legacyId].some(
      (value) => toStringValue(value) === requested,
    ),
  );
  if (!season) throw new Error(`Season ${requested} was not found`);
  return season;
}

function sqliteHighlights(rows: readonly AnyRow[]): ArchiveHighlight[] {
  return rows.map((row) => ({
    sourceId: toStringValue(row.sourcePlayerDayId),
    seasonId: toStringValue(row.seasonId),
    canonicalJson: canonicalJson(row),
    ratingRank: row.ratingRank === null ? null : Number(row.ratingRank),
    categoryRanksJson: canonicalJson(row.categoryRanks),
    selectionReasonsJson: canonicalJson(row.selectionReasons),
  }));
}

function verifyLocalRows(
  manifest: ArchiveManifest,
  rows: readonly ArchiveRow[],
) {
  const checksum = sha256(rows.map((row) => row.canonicalJson).join("\n"));
  if (
    rows.length !== manifest.sourceRowCount ||
    checksum !== manifest.sourceChecksum
  ) {
    throw new Error(
      "Local archive row count or checksum does not match its manifest",
    );
  }
}

function createConvexSnapshot(target: ArchiveTarget): {
  name: string;
  checksum: string;
} {
  const dir = path.join(
    path.dirname(resolveArchiveDbPath()),
    "convex-snapshots",
  );
  mkdirSync(dir, { recursive: true });
  const before = new Set(readdirSync(dir));
  const command = process.execPath;
  const args = [
    "--use-system-ca",
    path.join(repoRoot(), "node_modules", "convex", "bin", "main.js"),
    "export",
    "--path",
    dir,
  ];
  if (target === "production") args.push("--prod");
  const result = spawnSync(command, args, {
    cwd: repoRoot(),
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0)
    throw new Error(`Convex export failed: ${result.stderr || result.stdout}`);
  const candidates = readdirSync(dir)
    .filter((name) => name.endsWith(".zip") && !before.has(name))
    .map((name) => ({ name, time: statSync(path.join(dir, name)).mtimeMs }))
    .sort((left, right) => right.time - left.time);
  const name = candidates[0]?.name;
  if (!name) throw new Error("Convex export did not create a snapshot ZIP");
  const file = path.join(dir, name);
  if (!statSync(file).size) throw new Error("Convex snapshot ZIP is empty");
  return { name, checksum: sha256(readFileSync(file)) };
}

async function deleteArchivedSource(
  options: ArchiveOptions,
  seasonId: string,
  manifest: ArchiveManifest,
  rows: readonly ArchiveRow[],
  db: PlayerDayArchiveDatabase,
) {
  if (options.confirmSeasonId !== seasonId)
    throw new Error(
      "--confirm-season-id must exactly match the resolved season id",
    );
  const latest = prepareArchiveRows(await fetchRawPlayerDaySeason(seasonId));
  if (latest.checksum !== manifest.sourceChecksum)
    throw new Error("Convex source changed after archival; deletion aborted");
  const backup = createConvexSnapshot(options.target);
  await preparePlayerDayDeletion({
    seasonId,
    sourceChecksum: manifest.sourceChecksum,
    backupName: backup.name,
    backupChecksum: backup.checksum,
  });
  db.updateManifest(seasonId, {
    status: "deleting",
    preDeleteBackupName: backup.name,
    preDeleteBackupChecksum: backup.checksum,
    updatedAt: new Date().toISOString(),
  });
  for (let offset = 0; offset < rows.length; offset += 20) {
    await deleteVerifiedPlayerDayBatch({
      seasonId,
      sourceChecksum: manifest.sourceChecksum,
      rows: rows
        .slice(offset, offset + 20)
        .map((row) => ({ id: row.sourceId, canonicalJson: row.canonicalJson })),
    });
  }
  await completePlayerDayDeletion(seasonId, manifest.sourceChecksum);
  const now = new Date().toISOString();
  db.updateManifest(seasonId, {
    status: "archived",
    deletedAt: now,
    updatedAt: now,
  });
}

async function resumeDeletionIfNeeded(
  options: ArchiveOptions,
  seasonId: string,
): Promise<{
  seasonId: string;
  state: string;
  rows: number;
  highlights: number;
} | null> {
  if (!options.apply || !options.deleteSource) return null;
  const remote = await getPlayerDayArchiveState(seasonId);
  if (remote?.status !== "deleting") return null;
  if (options.confirmSeasonId !== seasonId) {
    throw new Error(
      "--confirm-season-id must exactly match the resolved season id",
    );
  }
  const db = new PlayerDayArchiveDatabase();
  try {
    const manifest = db.getManifest(seasonId);
    if (!manifest || manifest.sourceChecksum !== remote.sourceChecksum) {
      throw new Error(
        "Cannot resume deletion without the matching local archive",
      );
    }
    const archived = db.listRows(seasonId);
    verifyLocalRows(manifest, archived);
    verifyPortableBackup(manifest);
    const archivedById = new Map(archived.map((row) => [row.sourceId, row]));
    for (const current of await fetchRawPlayerDaySeason(seasonId)) {
      const source = sourceDocument(current);
      const archivedRow = archivedById.get(toStringValue(source._id));
      if (!archivedRow || archivedRow.canonicalJson !== canonicalJson(source)) {
        throw new Error(
          "A remaining Convex source row does not match the verified local archive",
        );
      }
    }
    db.updateManifest(seasonId, {
      status: "deleting",
      preDeleteBackupName:
        toStringValue(remote.preDeleteBackupName) ||
        manifest.preDeleteBackupName,
      preDeleteBackupChecksum:
        toStringValue(remote.preDeleteBackupChecksum) ||
        manifest.preDeleteBackupChecksum,
      updatedAt: new Date().toISOString(),
    });
    for (let offset = 0; offset < archived.length; offset += 20) {
      await deleteVerifiedPlayerDayBatch({
        seasonId,
        sourceChecksum: manifest.sourceChecksum,
        rows: archived.slice(offset, offset + 20).map((row) => ({
          id: row.sourceId,
          canonicalJson: row.canonicalJson,
        })),
      });
    }
    await completePlayerDayDeletion(seasonId, manifest.sourceChecksum);
    const now = new Date().toISOString();
    db.updateManifest(seasonId, {
      status: "archived",
      deletedAt: now,
      updatedAt: now,
    });
    return {
      seasonId,
      state: "archived",
      rows: archived.length,
      highlights: manifest.highlightCount,
    };
  } finally {
    db.close();
  }
}

export async function archiveSeason(options: ArchiveOptions, season: Season) {
  validateCompletedSeason(season);
  const seasonId = toStringValue(season.id);
  const resumed = await resumeDeletionIfNeeded(options, seasonId);
  if (resumed) return resumed;
  const rawRows = await fetchRawPlayerDaySeason(seasonId);
  if (!rawRows.length) {
    const state = await getPlayerDayArchiveState(seasonId);
    if (state?.status === "archived")
      return {
        seasonId,
        state: "already-archived",
        rows: 0,
        highlights: Number(state.highlightCount ?? 0),
      };
    throw new Error(`Season ${seasonId} has no player-day source rows`);
  }
  const prepared = prepareArchiveRows(rawRows);
  const generated = await aggregateSeasonStats(seasonId);
  const aggregateChecksums = await verifyAggregateParity(seasonId, generated);
  const activitySnapshot = await fetchSeasonActivity(seasonId);
  const categories = parseSeasonCategories(season.categories);
  const highlights = selectPlayerDayHighlights(
    generated.playerDays,
    rawRows,
    categories,
    prepared.checksum,
  );
  const summary = {
    seasonId,
    state: options.apply ? "verified" : "dry-run",
    rows: prepared.rows.length,
    highlights: highlights.length,
    checksum: prepared.checksum,
    aggregateChecksums,
  };
  if (!options.apply) return summary;

  const db = new PlayerDayArchiveDatabase();
  let remoteBegan = false;
  try {
    const existing = db.getManifest(seasonId);
    if (
      existing &&
      existing.sourceChecksum !== prepared.checksum &&
      !options.replaceExistingArchive
    ) {
      throw new Error(
        "A different local archive exists; use --replace-existing-archive to replace it",
      );
    }
    if (options.replaceExistingArchive && options.deleteSource) {
      throw new Error(
        "A replacement archive cannot delete source rows in the same invocation",
      );
    }
    const now = new Date().toISOString();
    const seasonRecord = season as unknown as AnyRow;
    let manifest: ArchiveManifest = {
      seasonId,
      seasonLegacyId: toStringValue(seasonRecord.legacyId),
      seasonName: toStringValue(season.name),
      seasonYear: toStringValue(season.year),
      status: "exporting",
      archiveVersion: ARCHIVE_VERSION,
      archiveKey: `player-days/${toStringValue(seasonRecord.legacyId) || seasonId}`,
      sourceRowCount: prepared.rows.length,
      sourceChecksum: prepared.checksum,
      firstDate: prepared.firstDate,
      lastDate: prepared.lastDate,
      highlightCount: highlights.length,
      aggregateChecksumsJson: canonicalJson(aggregateChecksums),
      activitySnapshotJson: canonicalJson(activitySnapshot),
      portableBackupName: null,
      portableBackupChecksum: null,
      preDeleteBackupName: null,
      preDeleteBackupChecksum: null,
      exportedAt: now,
      verifiedAt: null,
      deletedAt: null,
      restoredAt: null,
      updatedAt: now,
    };
    db.replaceSeason(manifest, prepared.rows, sqliteHighlights(highlights));
    verifyLocalRows(manifest, db.listRows(seasonId));
    const portable = await writePortableBackup(manifest, prepared.rows);
    if (
      existing?.portableBackupChecksum &&
      existing.sourceChecksum === prepared.checksum &&
      existing.portableBackupChecksum !== portable.checksum
    ) {
      throw new Error(
        "The existing portable backup failed its recorded checksum",
      );
    }
    db.updateManifest(seasonId, {
      portableBackupName: portable.name,
      portableBackupChecksum: portable.checksum,
      updatedAt: new Date().toISOString(),
    });
    await beginPlayerDayArchive({
      seasonId,
      replaceExisting: options.replaceExistingArchive,
      archiveKey: manifest.archiveKey,
      sourceRowCount: manifest.sourceRowCount,
      sourceChecksum: manifest.sourceChecksum,
      firstDate: manifest.firstDate ?? undefined,
      lastDate: manifest.lastDate ?? undefined,
      highlightCount: manifest.highlightCount,
      aggregateChecksums,
      activitySnapshot,
    });
    remoteBegan = true;
    await upsertPlayerDayHighlights(seasonId, prepared.checksum, highlights);
    await removeStalePlayerDayHighlights(seasonId, prepared.checksum);
    await finalizePlayerDayArchive(seasonId, prepared.checksum);
    const verifiedAt = new Date().toISOString();
    db.updateManifest(seasonId, {
      status: "verified",
      verifiedAt,
      updatedAt: verifiedAt,
    });
    manifest = db.getManifest(seasonId) ?? manifest;
    if (options.deleteSource)
      await deleteArchivedSource(
        options,
        seasonId,
        manifest,
        prepared.rows,
        db,
      );
    return summary;
  } catch (error) {
    if (remoteBegan)
      await markPlayerDayArchiveFailed(seasonId).catch(() => undefined);
    db.updateManifest(seasonId, {
      status: "failed",
      updatedAt: new Date().toISOString(),
    });
    throw error;
  } finally {
    db.close();
  }
}

export async function runArchive(options: ArchiveOptions) {
  configureConvexTarget(options.target);
  if (!options.seasonId && !options.allCompleted)
    throw new Error("--season-id or --all-completed is required");
  if (options.seasonId && options.allCompleted)
    throw new Error("--season-id and --all-completed are mutually exclusive");
  if (options.deleteSource && (!options.apply || options.allCompleted))
    throw new Error(
      "Source deletion requires --apply and a single --season-id",
    );
  const seasons = (await fetchModel<AnyRow>("Season")) as unknown as Season[];
  const selected = options.seasonId
    ? [resolveSeason(seasons, options.seasonId)]
    : seasons.filter((season) => {
        try {
          validateCompletedSeason(season);
          return true;
        } catch {
          return false;
        }
      });
  const results = [];
  for (const season of selected)
    results.push(await archiveSeason(options, season));
  return results;
}

export async function verifyArchive(target: ArchiveTarget, seasonId: string) {
  configureConvexTarget(target);
  const db = new PlayerDayArchiveDatabase();
  try {
    const manifest = db.getManifest(seasonId);
    if (!manifest)
      throw new Error(`No local archive exists for season ${seasonId}`);
    const rows = db.listRows(seasonId);
    verifyLocalRows(manifest, rows);
    verifyPortableBackup(manifest);
    const remote = await getPlayerDayArchiveState(seasonId);
    if (
      !remote ||
      remote.sourceChecksum !== manifest.sourceChecksum ||
      Number(remote.sourceRowCount) !== manifest.sourceRowCount
    ) {
      throw new Error("Convex archive manifest does not match SQLite");
    }
    return {
      seasonId,
      status: manifest.status,
      rows: rows.length,
      checksum: manifest.sourceChecksum,
    };
  } finally {
    db.close();
  }
}

function logicalDocument(row: AnyRow): AnyRow {
  const value = { ...row };
  delete value.id;
  delete value._id;
  delete value._creationTime;
  delete value.createdAt;
  delete value.updatedAt;
  return value;
}

export async function restoreArchive(options: RestoreOptions) {
  configureConvexTarget(options.target);
  const db = new PlayerDayArchiveDatabase();
  try {
    const manifest = db.getManifest(options.seasonId);
    if (!manifest)
      throw new Error(`No local archive exists for season ${options.seasonId}`);
    const archived = db.listRows(options.seasonId);
    verifyLocalRows(manifest, archived);
    verifyPortableBackup(manifest);
    const existing = await fetchRawPlayerDaySeason(options.seasonId);
    const existingByKey = new Map(
      existing.map((row) => [sourceKey(row), sourceDocument(row)]),
    );
    let inserts = 0,
      unchanged = 0,
      conflicts = 0;
    const restoreRows: AnyRow[] = [];
    for (const archivedRow of archived) {
      const raw = JSON.parse(archivedRow.canonicalJson) as AnyRow;
      const current = existingByKey.get(sourceKey(raw));
      if (!current) {
        inserts += 1;
        restoreRows.push(raw);
        continue;
      }
      if (
        canonicalJson(logicalDocument(current)) ===
        canonicalJson(logicalDocument(raw))
      )
        unchanged += 1;
      else {
        conflicts += 1;
        if (options.replaceConflicts) restoreRows.push(raw);
      }
    }
    const result = {
      seasonId: options.seasonId,
      inserts,
      unchanged,
      conflicts,
      applied: options.apply,
    };
    if (!options.apply) return result;
    if (options.confirmSeasonId !== options.seasonId)
      throw new Error("--confirm-season-id must exactly match --season-id");
    if (conflicts && !options.replaceConflicts)
      throw new Error(
        "Restore conflicts exist; use --replace-conflicts to replace them",
      );
    for (let offset = 0; offset < restoreRows.length; offset += 25) {
      await upsertAggregateRows(
        "PlayerDayStatLine",
        restoreRows.slice(offset, offset + 25),
      );
    }
    const restored = await fetchRawPlayerDaySeason(options.seasonId);
    const expectedLogical = archived
      .map((row) =>
        canonicalJson(logicalDocument(JSON.parse(row.canonicalJson) as AnyRow)),
      )
      .sort();
    const actualLogical = restored
      .map((row) => canonicalJson(logicalDocument(sourceDocument(row))))
      .sort();
    if (
      expectedLogical.length !== actualLogical.length ||
      sha256(expectedLogical.join("\n")) !== sha256(actualLogical.join("\n"))
    ) {
      throw new Error(
        "Restored logical checksum does not match the local archive",
      );
    }
    await completePlayerDayRestore(options.seasonId, manifest.sourceChecksum);
    const now = new Date().toISOString();
    db.updateManifest(options.seasonId, {
      status: "restored",
      restoredAt: now,
      updatedAt: now,
    });
    return { ...result, applied: true };
  } finally {
    db.close();
  }
}

export function parseArchiveOptions(args: string[]): ArchiveOptions {
  const value = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const target = value("--target");
  if (target !== "development" && target !== "production")
    throw new Error("--target development|production is required");
  return {
    target,
    seasonId: value("--season-id"),
    allCompleted: args.includes("--all-completed"),
    apply: args.includes("--apply"),
    deleteSource: args.includes("--delete-source"),
    confirmSeasonId: value("--confirm-season-id"),
    replaceExistingArchive: args.includes("--replace-existing-archive"),
  };
}

export function parseRestoreOptions(args: string[]): RestoreOptions {
  const archive = parseArchiveOptions(args);
  if (!archive.seasonId) throw new Error("--season-id is required");
  return {
    target: archive.target,
    seasonId: archive.seasonId,
    apply: archive.apply,
    confirmSeasonId: archive.confirmSeasonId,
    replaceConflicts: args.includes("--replace-conflicts"),
  };
}
