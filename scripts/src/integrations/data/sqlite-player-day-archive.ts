import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import { finished } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import { env } from "@gshl-env";

export type ArchiveRow = {
  sourceId: string;
  seasonId: string;
  gshlTeamId: string;
  playerId: string;
  weekId: string;
  date: string;
  canonicalJson: string;
  rowChecksum: string;
};

export type ArchiveHighlight = {
  sourceId: string;
  seasonId: string;
  canonicalJson: string;
  ratingRank: number | null;
  categoryRanksJson: string;
  selectionReasonsJson: string;
};

export type ArchiveManifest = {
  seasonId: string;
  seasonLegacyId: string;
  seasonName: string;
  seasonYear: string;
  status: string;
  archiveVersion: number;
  archiveKey: string;
  sourceRowCount: number;
  sourceChecksum: string;
  firstDate: string | null;
  lastDate: string | null;
  highlightCount: number;
  aggregateChecksumsJson: string;
  activitySnapshotJson: string;
  portableBackupName: string | null;
  portableBackupChecksum: string | null;
  preDeleteBackupName: string | null;
  preDeleteBackupChecksum: string | null;
  exportedAt: string;
  verifiedAt: string | null;
  deletedAt: string | null;
  restoredAt: string | null;
  updatedAt: string;
};

function repositoryRoot(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../../",
  );
}

export function resolveArchiveDbPath(): string {
  return env.GSHL_ARCHIVE_DB_PATH?.trim()
    ? path.resolve(env.GSHL_ARCHIVE_DB_PATH)
    : path.join(repositoryRoot(), ".local-data", "gshl-history.sqlite");
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export class PlayerDayArchiveDatabase {
  readonly dbPath: string;
  private readonly db: Database.Database;

  constructor(dbPath = resolveArchiveDbPath()) {
    this.dbPath = dbPath;
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS season_archives (
        season_id TEXT PRIMARY KEY, season_legacy_id TEXT NOT NULL,
        season_name TEXT NOT NULL, season_year TEXT NOT NULL,
        status TEXT NOT NULL, archive_version INTEGER NOT NULL,
        archive_key TEXT NOT NULL, source_row_count INTEGER NOT NULL,
        source_checksum TEXT NOT NULL, first_date TEXT, last_date TEXT,
        highlight_count INTEGER NOT NULL, aggregate_checksums_json TEXT NOT NULL,
        activity_snapshot_json TEXT NOT NULL, portable_backup_name TEXT,
        portable_backup_checksum TEXT, pre_delete_backup_name TEXT,
        pre_delete_backup_checksum TEXT, exported_at TEXT NOT NULL,
        verified_at TEXT, deleted_at TEXT, restored_at TEXT, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS player_day_stat_lines (
        source_id TEXT PRIMARY KEY,
        season_id TEXT NOT NULL REFERENCES season_archives(season_id) ON DELETE CASCADE,
        gshl_team_id TEXT NOT NULL, player_id TEXT NOT NULL,
        week_id TEXT NOT NULL, date TEXT NOT NULL,
        canonical_json TEXT NOT NULL, row_checksum TEXT NOT NULL,
        UNIQUE(season_id, gshl_team_id, player_id, week_id, date)
      );
      CREATE INDEX IF NOT EXISTS player_day_archive_by_season_date
        ON player_day_stat_lines(season_id, date);
      CREATE INDEX IF NOT EXISTS player_day_archive_by_season_player
        ON player_day_stat_lines(season_id, player_id);
      CREATE TABLE IF NOT EXISTS player_day_highlights (
        source_id TEXT NOT NULL,
        season_id TEXT NOT NULL REFERENCES season_archives(season_id) ON DELETE CASCADE,
        canonical_json TEXT NOT NULL, rating_rank INTEGER,
        category_ranks_json TEXT NOT NULL, selection_reasons_json TEXT NOT NULL,
        PRIMARY KEY(season_id, source_id)
      );
    `);
  }

  getManifest(seasonId: string): ArchiveManifest | null {
    const row = this.db
      .prepare("SELECT * FROM season_archives WHERE season_id = ?")
      .get(seasonId) as Record<string, unknown> | undefined;
    if (!row) return null;
    const camel = (key: string) =>
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [camel(key), value]),
    ) as ArchiveManifest;
  }

  replaceSeason(
    manifest: ArchiveManifest,
    rows: readonly ArchiveRow[],
    highlights: readonly ArchiveHighlight[],
  ): void {
    const transaction = this.db.transaction(() => {
      this.db
        .prepare("DELETE FROM season_archives WHERE season_id = ?")
        .run(manifest.seasonId);
      this.db
        .prepare(
          `
        INSERT INTO season_archives (
          season_id, season_legacy_id, season_name, season_year, status,
          archive_version, archive_key, source_row_count, source_checksum,
          first_date, last_date, highlight_count, aggregate_checksums_json,
          activity_snapshot_json, portable_backup_name, portable_backup_checksum,
          pre_delete_backup_name, pre_delete_backup_checksum, exported_at,
          verified_at, deleted_at, restored_at, updated_at
        ) VALUES (
          @seasonId, @seasonLegacyId, @seasonName, @seasonYear, @status,
          @archiveVersion, @archiveKey, @sourceRowCount, @sourceChecksum,
          @firstDate, @lastDate, @highlightCount, @aggregateChecksumsJson,
          @activitySnapshotJson, @portableBackupName, @portableBackupChecksum,
          @preDeleteBackupName, @preDeleteBackupChecksum, @exportedAt,
          @verifiedAt, @deletedAt, @restoredAt, @updatedAt
        )
      `,
        )
        .run(manifest);
      const insertRow = this.db.prepare(`
        INSERT INTO player_day_stat_lines (
          source_id, season_id, gshl_team_id, player_id, week_id, date,
          canonical_json, row_checksum
        ) VALUES (
          @sourceId, @seasonId, @gshlTeamId, @playerId, @weekId, @date,
          @canonicalJson, @rowChecksum
        )
      `);
      for (const row of rows) insertRow.run(row);
      const insertHighlight = this.db.prepare(`
        INSERT INTO player_day_highlights (
          source_id, season_id, canonical_json, rating_rank,
          category_ranks_json, selection_reasons_json
        ) VALUES (
          @sourceId, @seasonId, @canonicalJson, @ratingRank,
          @categoryRanksJson, @selectionReasonsJson
        )
      `);
      for (const highlight of highlights) insertHighlight.run(highlight);
    });
    transaction.immediate();
  }

  listRows(seasonId: string): ArchiveRow[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM player_day_stat_lines WHERE season_id = ? ORDER BY source_id",
      )
      .all(seasonId) as Record<string, unknown>[];
    return rows.map((row) => ({
      sourceId: String(row.source_id),
      seasonId: String(row.season_id),
      gshlTeamId: String(row.gshl_team_id),
      playerId: String(row.player_id),
      weekId: String(row.week_id),
      date: String(row.date),
      canonicalJson: String(row.canonical_json),
      rowChecksum: String(row.row_checksum),
    }));
  }

  updateManifest(seasonId: string, fields: Partial<ArchiveManifest>): void {
    const column = (key: string) =>
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    const entries = Object.entries(fields).filter(
      ([, value]) => value !== undefined,
    );
    if (!entries.length) return;
    const assignments = entries
      .map(([key]) => `${column(key)} = @${key}`)
      .join(", ");
    this.db
      .prepare(
        `UPDATE season_archives SET ${assignments} WHERE season_id = @seasonId`,
      )
      .run({
        seasonId,
        ...Object.fromEntries(entries),
      });
  }

  close(): void {
    this.db.pragma("wal_checkpoint(TRUNCATE)");
    this.db.close();
  }
}

export async function writePortableBackup(
  manifest: ArchiveManifest,
  rows: readonly ArchiveRow[],
): Promise<{ name: string; checksum: string }> {
  const backupDir = path.join(path.dirname(resolveArchiveDbPath()), "backups");
  mkdirSync(backupDir, { recursive: true });
  const safeSeason = (
    manifest.seasonLegacyId ||
    manifest.seasonYear ||
    manifest.seasonId
  ).replace(/[^a-zA-Z0-9_-]/g, "-");
  const name = `player-days-${safeSeason}-${manifest.sourceChecksum.slice(0, 12)}.jsonl.gz`;
  const target = path.join(backupDir, name);
  if (existsSync(target))
    return { name, checksum: sha256(readFileSync(target)) };
  const gzip = createGzip({ level: 9 });
  const output = createWriteStream(target, { flags: "wx" });
  gzip.pipe(output);
  gzip.write(`${JSON.stringify({ type: "manifest", manifest })}\n`);
  for (const row of rows) {
    gzip.write(
      `${JSON.stringify({ type: "playerDay", row: JSON.parse(row.canonicalJson) })}\n`,
    );
  }
  gzip.end();
  await finished(output);
  return { name, checksum: sha256(readFileSync(target)) };
}

export function verifyPortableBackup(manifest: ArchiveManifest): void {
  if (!manifest.portableBackupName || !manifest.portableBackupChecksum) {
    throw new Error("Portable archive backup metadata is missing");
  }
  const target = path.join(
    path.dirname(resolveArchiveDbPath()),
    "backups",
    manifest.portableBackupName,
  );
  if (!existsSync(target))
    throw new Error(`Portable archive backup is missing: ${target}`);
  if (sha256(readFileSync(target)) !== manifest.portableBackupChecksum) {
    throw new Error(
      "Portable archive backup checksum does not match the manifest",
    );
  }
}
