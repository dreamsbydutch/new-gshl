import fs from "node:fs/promises";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import {
  MODEL_TO_CONVEX_TABLE,
  type SheetModelName as ModelName,
} from "@gshl-lib/data/model-map";

loadEnv({ path: path.resolve(process.cwd(), "..", ".env.local") });
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

type Row = Record<string, unknown>;
type IdMap = Map<string, string>;

const clearTables = makeFunctionReference<
  "mutation",
  { serverSecret: string; tables: string[] },
  { deleted: Record<string, number> }
>("data:clearTables");
const insertMany = makeFunctionReference<
  "mutation",
  { serverSecret: string; table: string; rows: Row[] },
  { inserted: Array<{ legacyId: string | null; id: string }> }
>("data:insertMany");

const IMPORT_ORDER: ModelName[] = [
  "Season",
  "Conference",
  "Owner",
  "Franchise",
  "Team",
  "Week",
  "Player",
  "Contract",
  "Event",
  "Matchup",
  "Awards",
  "DraftPick",
  "NHLTeam",
  "PlayerNHLStatLine",
  "PlayerDayStatLine",
  "PlayerWeekStatLine",
  "PlayerSplitStatLine",
  "PlayerTotalStatLine",
  "PlayerCareerSplitStatLine",
  "PlayerCareerTotalStatLine",
  "TeamDayStatLine",
  "TeamWeekStatLine",
  "TeamSeasonStatLine",
];

const RELATIONS: Partial<
  Record<
    ModelName,
    Record<string, ModelName | { model: ModelName; many: true }>
  >
> = {
  Franchise: { ownerId: "Owner", confId: "Conference" },
  Team: { seasonId: "Season", franchiseId: "Franchise", confId: "Conference" },
  Week: { seasonId: "Season" },
  Player: { gshlTeamId: "Team" },
  Contract: { playerId: "Player", ownerId: "Owner", seasonId: "Season" },
  Event: { seasonId: "Season" },
  Matchup: {
    seasonId: "Season",
    weekId: "Week",
    homeTeamId: "Team",
    awayTeamId: "Team",
  },
  Awards: { seasonId: "Season" },
  DraftPick: {
    seasonId: "Season",
    gshlTeamId: "Team",
    originalTeamId: "Team",
    playerId: "Player",
  },
  PlayerNHLStatLine: { seasonId: "Season", playerId: "Player" },
  PlayerDayStatLine: {
    seasonId: "Season",
    gshlTeamId: "Team",
    playerId: "Player",
    weekId: "Week",
  },
  PlayerWeekStatLine: {
    seasonId: "Season",
    gshlTeamId: "Team",
    playerId: "Player",
    weekId: "Week",
  },
  PlayerSplitStatLine: {
    seasonId: "Season",
    gshlTeamId: "Team",
    playerId: "Player",
  },
  PlayerTotalStatLine: {
    seasonId: "Season",
    gshlTeamIds: { model: "Team", many: true },
    playerId: "Player",
  },
  PlayerCareerSplitStatLine: { gshlTeamId: "Team", playerId: "Player" },
  PlayerCareerTotalStatLine: {
    gshlTeamIds: { model: "Team", many: true },
    playerId: "Player",
  },
  TeamDayStatLine: { seasonId: "Season", gshlTeamId: "Team", weekId: "Week" },
  TeamWeekStatLine: { seasonId: "Season", gshlTeamId: "Team", weekId: "Week" },
  TeamSeasonStatLine: { seasonId: "Season", gshlTeamId: "Team" },
};

const BATCH_SIZE = Number(process.env.CONVEX_MIGRATION_BATCH_SIZE ?? 500);

function requireConvexUrl(): string {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is required for convex:migrate.");
  }
  return url;
}

function normalizeLegacyId(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Row).map(([key, entry]) => [
        key,
        serializeValue(entry),
      ]),
    );
  }
  return value;
}

function mapOne(
  modelMaps: Map<ModelName, IdMap>,
  targetModel: ModelName,
  value: unknown,
  missing: Array<{ field: string; targetModel: ModelName; legacyId: string }>,
  field: string,
): unknown {
  const legacyId = normalizeLegacyId(value);
  if (!legacyId) return value;

  const mapped = modelMaps.get(targetModel)?.get(legacyId);
  if (mapped) return mapped;

  missing.push({ field, targetModel, legacyId });
  return value;
}

function rewriteRelations(
  model: ModelName,
  row: Row,
  modelMaps: Map<ModelName, IdMap>,
  missing: Array<{ field: string; targetModel: ModelName; legacyId: string }>,
): Row {
  const rules = RELATIONS[model];
  if (!rules) return row;

  const next: Row = { ...row };
  for (const [field, target] of Object.entries(rules)) {
    if (!(field in next)) continue;
    if (typeof target === "object" && target.many) {
      const values = Array.isArray(next[field])
        ? next[field]
        : String(next[field] ?? "")
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean);
      next[field] = values.map((value) =>
        mapOne(modelMaps, target.model, value, missing, field),
      );
      continue;
    }

    next[field] = mapOne(
      modelMaps,
      target as ModelName,
      next[field],
      missing,
      field,
    );
  }

  return next;
}

function toConvexRow(
  model: ModelName,
  row: Row,
  modelMaps: Map<ModelName, IdMap>,
  missingRelations: Array<{
    field: string;
    targetModel: ModelName;
    legacyId: string;
  }>,
): Row {
  const { id, ...rest } = row;
  const legacyId = normalizeLegacyId(id);
  const serialized = serializeValue(rest) as Row;
  return rewriteRelations(
    model,
    {
      ...serialized,
      ...(legacyId ? { legacyId } : {}),
    },
    modelMaps,
    missingRelations,
  );
}

async function main() {
  process.env.GSHL_DATA_BACKEND = "sheets";
  process.env.USE_GOOGLE_SHEETS ??= "true";
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ??= "credentials.json";

  const { fastSheetsReader } = await import(
    "@gshl-lib/sheets/reader/fast-reader"
  );
  const client = new ConvexHttpClient(requireConvexUrl());
  const serverSecret = process.env.CONVEX_SERVER_SECRET;
  if (!serverSecret) {
    throw new Error("CONVEX_SERVER_SECRET is required for Convex migrations.");
  }
  const modelMaps = new Map<ModelName, IdMap>();
  const report = {
    startedAt: new Date().toISOString(),
    finishedAt: "",
    batchSize: BATCH_SIZE,
    cleared: {} as Record<string, number>,
    tables: {} as Record<
      string,
      {
        sourceRows: number;
        insertedRows: number;
        duplicateLegacyIds: string[];
        missingRelations: Array<{
          field: string;
          targetModel: ModelName;
          legacyId: string;
        }>;
      }
    >,
  };

  const tablesToClear = Array.from(
    new Set(IMPORT_ORDER.map((model) => MODEL_TO_CONVEX_TABLE[model])),
  ).reverse();
  report.cleared = (
    await client.mutation(clearTables, { serverSecret, tables: tablesToClear })
  ).deleted;

  for (const model of IMPORT_ORDER) {
    const table = MODEL_TO_CONVEX_TABLE[model];
    const sourceRows = (await fastSheetsReader.fetchModel(model)) as Row[];
    const missingRelations: Array<{
      field: string;
      targetModel: ModelName;
      legacyId: string;
    }> = [];
    const duplicateLegacyIds = new Set<string>();
    const seenLegacyIds = new Set<string>();
    const idMap: IdMap = new Map();
    let insertedRows = 0;

    const rows = sourceRows.map((row) => {
      const legacyId = normalizeLegacyId(row.id);
      if (legacyId) {
        if (seenLegacyIds.has(legacyId)) duplicateLegacyIds.add(legacyId);
        seenLegacyIds.add(legacyId);
      }
      return toConvexRow(model, row, modelMaps, missingRelations);
    });

    for (let index = 0; index < rows.length; index += BATCH_SIZE) {
      const batch = rows.slice(index, index + BATCH_SIZE);
      const result = await client.mutation(insertMany, {
        serverSecret,
        table,
        rows: batch,
      });
      insertedRows += result.inserted.length;
      for (const inserted of result.inserted) {
        if (inserted.legacyId) idMap.set(inserted.legacyId, inserted.id);
      }
    }

    modelMaps.set(model, idMap);
    report.tables[model] = {
      sourceRows: sourceRows.length,
      insertedRows,
      duplicateLegacyIds: Array.from(duplicateLegacyIds).sort(),
      missingRelations,
    };

    console.log(
      `${model}: source=${sourceRows.length} inserted=${insertedRows} missingRelations=${missingRelations.length}`,
    );
  }

  report.finishedAt = new Date().toISOString();
  const reportPath = path.resolve(
    process.cwd(),
    "reports",
    "convex-migration-latest.json",
  );
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`Migration report written to ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
