import { access, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as store from "../data/convex-store";
import type { DatabaseRecord } from "../data/records";
import {
  careerImpactKey,
  fitSeasonImpactReference,
  impactFields,
  impactId,
  impactRowKey,
  IMPACT_TABLES,
  scoreSeasonImpact,
  UNIFORM_IMPACT_VERSION,
  type ImpactTable,
  type UniformImpactInputs,
} from "../../domains/ranking/uniform-impact";
import { composePublishedCareerImpacts } from "../../domains/ranking/career-impact";
import { ensureTargetCalendarExposure } from "./target-calendar-exposure";

export async function readUniformImpactInputs(
  configPath: string,
): Promise<UniformImpactInputs> {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  if (
    config.version !== UNIFORM_IMPACT_VERSION ||
    config.referencePolicy !==
      "leave-target-season-out-with-unique-category-fallback"
  )
    throw Error("Known uniform impact reference configuration required");
  const [corpus, exposure] = await Promise.all([
    readFile(resolve(config.corpus), "utf8"),
    readFile(resolve(config.exposure), "utf8"),
  ]);
  const digest = (bytes: string) =>
    createHash("sha256").update(bytes).digest("hex");
  if (
    digest(corpus) !== config.corpusSha256 ||
    digest(exposure) !== config.exposureSha256
  )
    throw Error("Reviewed uniform impact reference hash mismatch");
  return { corpus: JSON.parse(corpus), exposure: JSON.parse(exposure) };
}

export const UNIFORM_IMPACT_CONFIG_PATH = fileURLToPath(
  new URL(
    "../../../../.local-data/gshl-uniform-impact-20261020/reference-config.json",
    import.meta.url,
  ),
);
const models: Record<string, ImpactTable> = Object.fromEntries(
  IMPACT_TABLES.map((table) => [
    table[0]!.toUpperCase() + table.slice(1, -1),
    table,
  ]),
);
export async function hasUniformImpactConfiguration(): Promise<boolean> {
  try {
    await access(
      process.env.GSHL_IMPACT_REFERENCE_CONFIG || UNIFORM_IMPACT_CONFIG_PATH,
    );
    return true;
  } catch {
    return false;
  }
}
export type UniformImpactRankingOptions = {
  /** Generated or hypothetical source rows; omitted callers retain persisted-day reads. */
  daysBySeason?: ReadonlyMap<string, readonly DatabaseRecord[]>;
};

export function uniformImpactDaysForSeason(
  options: UniformImpactRankingOptions,
  seasonId: string,
): DatabaseRecord[] | undefined {
  const rows = options.daysBySeason?.get(seasonId);
  if (rows === undefined) return undefined;
  const keys = new Set<string>();
  for (const row of rows) {
    if (
      row.seasonId !== seasonId ||
      typeof row.playerId !== "string" ||
      !row.playerId ||
      typeof row.date !== "string" ||
      !row.date
    )
      throw Error(
        "Generated rating days require canonical season/player/date scope",
      );
    const key = JSON.stringify([row.playerId, row.date]);
    if (keys.has(key)) throw Error("Duplicate generated rating player/date");
    keys.add(key);
  }
  return rows.map((row) => ({ ...row }));
}

/** A single calculation boundary for rebuilds and daily imports. An installed
 * reference is mandatory for rows already migrated to the new rating units. */
export async function rankUniformImpactSets(
  sets: Partial<Record<ImpactTable, DatabaseRecord[]>>,
  options: UniformImpactRankingOptions = {},
): Promise<boolean> {
  if (!(await hasUniformImpactConfiguration())) {
    throw Error(
      "Uniform impact reference missing; refusing legacy GSHL rating calculation",
    );
  }
  const seasons = await store.fetchModel<DatabaseRecord>("Season");
  const careers =
    !!sets.playerCareerSplitStatLines?.length ||
    !!sets.playerCareerTotalStatLines?.length;
  const knownSeasons = new Set(seasons.map(impactId));
  for (const [table, rows] of Object.entries(sets))
    if (
      !table.startsWith("playerCareer") &&
      rows?.some((row) => !knownSeasons.has(String(row.seasonId ?? "")))
    )
      throw Error("Canonical season required for every GSHL rating row");
  // Careers consume published periods; they never expand the day-scoring scope.
  const targets = seasons.filter((s) =>
    Object.entries(sets).some(
      ([table, rows]) =>
        !table.startsWith("playerCareer") &&
        rows?.some((row) => row.seasonId === impactId(s)),
    ),
  );
  const inputs = targets.length
    ? await readUniformImpactInputs(
        process.env.GSHL_IMPACT_REFERENCE_CONFIG || UNIFORM_IMPACT_CONFIG_PATH,
      )
    : null;
  const weeks = targets.length
    ? await store.fetchModel<DatabaseRecord>("Week")
    : [];
  const publishedSplits: Record<string, unknown>[] = [];
  const publishedTotals: Record<string, unknown>[] = [];
  for (const season of targets) {
    const seasonId = impactId(season),
      sw = weeks.filter((w) => w.seasonId === seasonId);
    const onlyDays = Object.keys(sets).every((t) => t === "playerDayStatLines");
    const scoped: Partial<Record<ImpactTable, DatabaseRecord[]>> = {};
    for (const table of IMPACT_TABLES)
      if (!table.startsWith("playerCareer"))
        scoped[table] = (sets[table] ?? []).filter(
          (r) => r.seasonId === seasonId,
        );
    if (onlyDays)
      for (const t of IMPACT_TABLES)
        if (t !== "playerDayStatLines") delete scoped[t];
    const suppliedDays = uniformImpactDaysForSeason(options, seasonId);
    const days =
      suppliedDays ??
      (onlyDays
        ? (scoped.playerDayStatLines ?? [])
        : await store.fetchWeekScopedModel<DatabaseRecord>(
            "PlayerDayStatLine",
            seasonId,
            sw.map(impactId),
          ));
    const reference = await fitSeasonImpactReference(
      inputs!,
      seasonId,
      season.categories as string[],
    );
    const targetExposure = await ensureTargetCalendarExposure(
      inputs!.exposure,
      sw,
      [season],
      days,
    );
    const result = await scoreSeasonImpact({
      season,
      weeks: sw,
      days,
      tables: scoped,
      reference,
      exposure: targetExposure,
    });
    for (const [table, rows] of Object.entries(scoped))
      for (const row of rows ?? []) {
        const fields = result.scores
          .get(table as ImpactTable)
          ?.get(impactRowKey(table as ImpactTable, row));
        if (!fields) throw Error("Missing uniform rating output");
        Object.assign(row, fields);
      }
    // Quantize once at the season publication boundary, exactly as stored PS/PT.
    if (careers) {
      for (const [split, values, destination] of [
        [true, result.careerSplits, publishedSplits],
        [false, result.careerTotals, publishedTotals],
      ] as const)
        for (const [key, value] of values) {
          const parts: string[] = JSON.parse(key);
          destination.push({
            seasonId,
            playerId: parts[0],
            ...(split
              ? { gshlTeamId: parts[1], seasonType: parts[2] }
              : { seasonType: parts[1] }),
            ...impactFields(value.value, value.appearances),
          });
        }
    }
  }
  if (!careers) return true;
  const refreshed = new Set(targets.map(impactId));
  // Indexed, bounded season reads replace historical player-day/refitting work.
  for (const season of seasons) {
    const seasonId = impactId(season);
    if (refreshed.has(seasonId)) continue;
    if (sets.playerCareerSplitStatLines?.length)
      publishedSplits.push(
        ...(await store.fetchSeasonModel<DatabaseRecord>(
          "PlayerSplitStatLine",
          seasonId,
        )),
      );
    if (sets.playerCareerTotalStatLines?.length)
      publishedTotals.push(
        ...(await store.fetchSeasonModel<DatabaseRecord>(
          "PlayerTotalStatLine",
          seasonId,
        )),
      );
  }
  const cs = composePublishedCareerImpacts(publishedSplits, true);
  const ct = composePublishedCareerImpacts(publishedTotals, false);
  for (const [table, split, values] of [
    ["playerCareerSplitStatLines", true, cs],
    ["playerCareerTotalStatLines", false, ct],
  ] as const)
    for (const row of sets[table] ?? []) {
      const fields = values.get(careerImpactKey(row, split));
      if (!fields && Number(row.GS ?? 0) > 0)
        throw Error("Started career has no published v3 season contribution");
      Object.assign(row, fields ?? impactFields(0, 0));
    }
  return true;
}
export async function tryRankUniformImpactRows(
  rows: DatabaseRecord[],
  model: string,
): Promise<boolean> {
  const table = models[model];
  return table ? rankUniformImpactSets({ [table]: rows }) : false;
}
