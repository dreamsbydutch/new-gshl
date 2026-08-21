import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  PlayerDayArchiveDatabase,
  sha256,
  type ArchiveManifest,
} from "./sqlite-player-day-archive";

void test("SQLite archive round trips canonical rows and rolls back uniqueness failures", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "gshl-archive-"));
  const db = new PlayerDayArchiveDatabase(
    path.join(directory, "archive.sqlite"),
  );
  const now = new Date().toISOString();
  const json = JSON.stringify({ _id: "row", value: 1 });
  const manifest: ArchiveManifest = {
    seasonId: "season",
    seasonLegacyId: "12",
    seasonName: "Season 12",
    seasonYear: "2025",
    status: "exporting",
    archiveVersion: 1,
    archiveKey: "player-days/12",
    sourceRowCount: 1,
    sourceChecksum: sha256(json),
    firstDate: "2025-01-01",
    lastDate: "2025-01-01",
    highlightCount: 0,
    aggregateChecksumsJson: "{}",
    activitySnapshotJson: "[]",
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
  const row = {
    sourceId: "row",
    seasonId: "season",
    gshlTeamId: "team",
    playerId: "player",
    weekId: "week",
    date: "2025-01-01",
    canonicalJson: json,
    rowChecksum: sha256(json),
  };
  try {
    db.replaceSeason(manifest, [row], []);
    assert.deepEqual(db.listRows("season"), [row]);
    assert.equal(
      db.getManifest("season")?.sourceChecksum,
      manifest.sourceChecksum,
    );
    assert.throws(() =>
      db.replaceSeason(manifest, [row, { ...row, sourceId: "duplicate" }], []),
    );
    assert.deepEqual(db.listRows("season"), [row]);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
