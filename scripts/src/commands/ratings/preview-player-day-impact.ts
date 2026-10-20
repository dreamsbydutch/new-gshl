import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  HISTORICAL_DAY_IMPACT_POLICY,
  loadPlayerDayImpact,
  rankPlayerDayImpactRows,
  isCountedPlayerDay,
  toDayImpactAppearance,
  type DayImpactContext,
  type PlayerDayImpactRatingOptions,
} from "../../domains/ranking/player-day-impact";
import type { DatabaseRecord } from "../../integrations/data/records";
import {
  attachPlayerDayCalendarExposure,
  CALENDAR_EXPOSURE_CHRONOLOGY_LIMITATION,
} from "../../domains/ranking/player-day-calendar-exposure";

const HELP = `Local player-day impact reference and preview (no database access).

Usage: node --use-system-ca --import tsx scripts/src/commands/ratings/preview-player-day-impact.ts
  --corpus FILE --trained-before YYYY-MM-DD --rows FILE
  --contexts-by-week-id FILE --output NEW_DIRECTORY

Inputs:
  --corpus FILE                JSON object with historical matchups[] contexts.
  --trained-before DATE        Only contexts ending strictly before this date.
  --rows FILE                  JSON array of DB-style player-day records.
  --contexts-by-week-id FILE   JSON map: weekId -> {startDate,endDate,categories,
                               weekDays,goalieMinimum}. Required for every row.
Options:
  --history-years INTEGER     Optional trailing calendar-year history window.
  --weighting NAME            side-week (default) or appearance.
  --count-model NAME          empirical (default) or normal.
  --context-model NAME        week-days (default) or schedule-kernel.
  --calendar-exposure FILE    Schedule sidecar, required for schedule-kernel.
  --exposure-bandwidth NUMBER Positive kernel bandwidth; requires schedule-kernel.
  --max-goalie-contexts N      Optional approximation cap; omitted uses all.
  --output-field NAME         Preview field (default dayImpactRating).
  --include-breakdown          Include per-category support and contribution.
  --include-actual-matchup-impact
                               Add separate completed-matchup diagnostics from
                               corpus team/week totals; implies breakdown.
  --help                      Print this help.

Writes fitted-reference.json, preview-rows.json and manifest.json exclusively
to a new directory. Future candidate history is excluded and counted. The core
checks training dates; preview weeks must start on/after trained-before. Ratings
use 100 units per expected category point. No production apply is supported.
`;

type Binding = { path: string; sha256: string };
const sha256 = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");

function dateKey(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

function positiveInteger(value: string | undefined, name: string) {
  if (value === undefined) return undefined;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw Error(`${name} must be a positive integer`);
  return Number(value);
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function actualMatchupsForRows(
  matchups: unknown[],
  rows: DatabaseRecord[],
  contexts: PlayerDayImpactRatingOptions["contextsByWeekId"],
): NonNullable<PlayerDayImpactRatingOptions["actualMatchupsByWeekAndTeamId"]> {
  type Side = {
    raw: Record<string, number>;
    goalieAppearances: number;
    appearances: Record<string, unknown>[];
  };
  const requestedWeeks = new Set(rows.map((row) => String(row.weekId)));
  const index = new Map<string, Map<string, { own: Side; opponent: Side }>>();
  for (const candidate of matchups) {
    if (!object(candidate) || !requestedWeeks.has(String(candidate.weekId)))
      continue;
    const weekId = String(candidate.weekId);
    const context = contexts[weekId];
    if (
      !context ||
      !dateKey(String(candidate.startDate)) ||
      !dateKey(String(candidate.endDate)) ||
      candidate.startDate !== context.startDate ||
      candidate.endDate !== context.endDate ||
      !Array.isArray(candidate.categories) ||
      candidate.categories.some((category) => typeof category !== "string") ||
      new Set(candidate.categories).size !== candidate.categories.length ||
      JSON.stringify([...candidate.categories].sort()) !==
        JSON.stringify([...context.categories].sort())
    )
      throw Error(
        "Actual matchup dates/categories must match requested week context",
      );
    function side(value: unknown): Side & { teamId: string } {
      if (
        !object(value) ||
        typeof value.teamId !== "string" ||
        !value.teamId.trim() ||
        !object(value.raw) ||
        Object.values(value.raw).some(
          (v) => typeof v !== "number" || !Number.isFinite(v),
        ) ||
        !Array.isArray(value.appearances) ||
        value.appearances.some(
          (a) => !object(a) || !["skater", "goalie"].includes(String(a.role)),
        )
      )
        throw Error(
          "Complete actual matchup team identities/raw totals required",
        );
      const goalieAppearances = value.appearances.filter(
        (a) => object(a) && a.role === "goalie",
      ).length;
      if (
        value.goalieStarts !== undefined &&
        value.goalieStarts !== goalieAppearances
      )
        throw Error(
          "Actual matchup goalie starts disagree with appearance count",
        );
      if (
        value.goalieMinimum !== undefined &&
        value.goalieMinimum !== context.goalieMinimum
      )
        throw Error(
          "Actual matchup goalie minimum disagrees with requested rules",
        );
      return {
        teamId: value.teamId,
        raw: { ...value.raw } as Record<string, number>,
        goalieAppearances,
        appearances: value.appearances as Record<string, unknown>[],
      };
    }
    const home = side(candidate.home),
      away = side(candidate.away);
    if (home.teamId === away.teamId)
      throw Error("Distinct actual matchup teams required");
    let teams = index.get(weekId);
    if (!teams) {
      teams = new Map();
      index.set(weekId, teams);
    }
    if (teams.has(home.teamId) || teams.has(away.teamId))
      throw Error("Duplicate actual matchup week/team identity");
    teams.set(home.teamId, { own: home, opponent: away });
    teams.set(away.teamId, { own: away, opponent: home });
  }
  for (const row of rows) {
    if (
      typeof row.weekId !== "string" ||
      typeof row.gshlTeamId !== "string" ||
      !index.get(row.weekId)?.has(row.gshlTeamId)
    )
      throw Error(
        "Requested row lacks an exact actual matchup week/team identity",
      );
    if (Number(row.GP) !== 1 || !isCountedPlayerDay(row)) continue;
    const appearance = toDayImpactAppearance(row);
    const rawRowId = row._id ?? row.id;
    const rowId =
      typeof rawRowId === "string" && rawRowId.trim() ? rawRowId : undefined;
    const matches = index
      .get(row.weekId)!
      .get(row.gshlTeamId)!
      .own.appearances.filter((candidate) => {
        const rawCandidateId = candidate.statLineId ?? candidate._id;
        const candidateId =
          typeof rawCandidateId === "string" && rawCandidateId.trim()
            ? rawCandidateId
            : undefined;
        if (rowId !== undefined && candidateId !== undefined)
          return rowId === candidateId && candidate.role === appearance.role;
        return (
          typeof row.playerId === "string" &&
          !!row.playerId.trim() &&
          candidate.playerId === row.playerId &&
          candidate.date === row.date &&
          candidate.role === appearance.role
        );
      });
    if (matches.length !== 1)
      throw Error("Requested starter lacks a unique actual source appearance");
    const actual = matches[0]!;
    if (
      (actual.date !== undefined && actual.date !== row.date) ||
      (actual.playerId !== undefined && actual.playerId !== row.playerId)
    )
      throw Error(
        "Actual source appearance identity/date disagrees with requested starter",
      );
    const roleCategories =
      appearance.role === "goalie"
        ? ["W", "GA", "SA", "GAA", "SV", "SVP", "SO"]
        : ["G", "A", "P", "PM", "PIM", "PPP", "SOG", "HIT", "BLK"];
    const required = new Set(
      contexts[row.weekId]!.categories.filter((c) =>
        roleCategories.includes(c),
      ).flatMap((c) =>
        c === "GAA" ? ["GA", "TOI"] : c === "SVP" ? ["SV", "SA"] : [c],
      ),
    );
    const actualRaw = actual.raw;
    const actualAvailableFields = actual.availableFields;
    if (
      !object(actualRaw) ||
      !Array.isArray(actualAvailableFields) ||
      [...required].some(
        (field) =>
          !appearance.availableFields.includes(field) ||
          !actualAvailableFields.includes(field) ||
          actualRaw[field] !== appearance.raw[field],
      )
    )
      throw Error(
        "Requested starter performance disagrees with actual source appearance",
      );
  }
  return Object.fromEntries(
    [...index].map(([weekId, teams]) => [
      weekId,
      Object.fromEntries(
        [...teams].map(([teamId, pair]) => [
          teamId,
          {
            own: {
              raw: pair.own.raw,
              goalieAppearances: pair.own.goalieAppearances,
            },
            opponent: {
              raw: pair.opponent.raw,
              goalieAppearances: pair.opponent.goalieAppearances,
            },
          },
        ]),
      ),
    ]),
  );
}

export async function previewPlayerDayImpact(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      help: { type: "boolean" },
      corpus: { type: "string" },
      "trained-before": { type: "string" },
      rows: { type: "string" },
      "contexts-by-week-id": { type: "string" },
      output: { type: "string" },
      "history-years": { type: "string" },
      weighting: { type: "string", default: "side-week" },
      "count-model": { type: "string", default: "empirical" },
      "context-model": { type: "string", default: "week-days" },
      "calendar-exposure": { type: "string" },
      "exposure-bandwidth": { type: "string" },
      "max-goalie-contexts": { type: "string" },
      "output-field": { type: "string", default: "dayImpactRating" },
      "include-breakdown": { type: "boolean", default: false },
      "include-actual-matchup-impact": { type: "boolean", default: false },
    },
  });
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  for (const name of [
    "corpus",
    "trained-before",
    "rows",
    "contexts-by-week-id",
    "output",
  ] as const)
    if (!values[name]) throw Error(`--${name} is required`);
  const trainedBefore = values["trained-before"]!;
  if (!dateKey(trainedBefore)) throw Error("Canonical trained-before required");
  const historyYears = positiveInteger(
    values["history-years"],
    "history-years",
  );
  const maxGoalieContexts = positiveInteger(
    values["max-goalie-contexts"],
    "max-goalie-contexts",
  );
  const backgroundWeighting = values.weighting;
  const countModel = values["count-model"];
  if (
    backgroundWeighting !== "side-week" &&
    backgroundWeighting !== "appearance"
  )
    throw Error("Unknown weighting");
  if (countModel !== "empirical" && countModel !== "normal")
    throw Error("Unknown count-model");
  const contextModel = values["context-model"];
  if (contextModel !== "week-days" && contextModel !== "schedule-kernel")
    throw Error("Unknown context-model");
  const exposureBandwidth =
    values["exposure-bandwidth"] === undefined
      ? undefined
      : Number(values["exposure-bandwidth"]);
  if (contextModel === "schedule-kernel") {
    if (
      !values["calendar-exposure"] ||
      !Number.isFinite(exposureBandwidth) ||
      Number(exposureBandwidth) <= 0
    )
      throw Error(
        "schedule-kernel requires calendar-exposure and a positive exposure-bandwidth",
      );
  } else if (values["calendar-exposure"] || exposureBandwidth !== undefined) {
    throw Error("Calendar exposure options require schedule-kernel");
  }
  const outputField = values["output-field"]!;
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(outputField))
    throw Error("Invalid output-field");
  const output = resolve(values.output!);
  try {
    await lstat(output);
    throw Error("Output directory must be new");
  } catch (error) {
    if (!(object(error) && error.code === "ENOENT")) throw error;
  }

  const bindings: Binding[] = [];
  async function input(path: string): Promise<unknown> {
    const absolute = resolve(path);
    const bytes = await readFile(absolute);
    bindings.push({ path: absolute, sha256: sha256(bytes) });
    return JSON.parse(bytes.toString());
  }
  const codeBindings = await Promise.all(
    [
      fileURLToPath(import.meta.url),
      fileURLToPath(
        new URL("../../domains/ranking/player-day-impact.ts", import.meta.url),
      ),
      fileURLToPath(
        new URL(
          "../../domains/ranking/player-day-calendar-exposure.ts",
          import.meta.url,
        ),
      ),
      fileURLToPath(
        new URL(
          "../../runtime/RankingEngine/player-day-impact.js",
          import.meta.url,
        ),
      ),
    ].map(async (path) => ({ path, sha256: sha256(await readFile(path)) })),
  );
  const corpus = await input(values.corpus!);
  const rows = await input(values.rows!);
  let contexts = await input(values["contexts-by-week-id"]!);
  if (!object(corpus) || !Array.isArray(corpus.matchups))
    throw Error("Corpus must contain matchups[]");
  if (!Array.isArray(rows) || rows.some((row) => !object(row)))
    throw Error("Rows must be an array of records");
  if (!object(contexts) || Object.values(contexts).some((v) => !object(v)))
    throw Error("contexts-by-week-id must be an explicit context map");
  let history = corpus.matchups as DayImpactContext[];
  if (history.some((c) => !object(c) || !dateKey(String(c.endDate))))
    throw Error("Every candidate history context needs a canonical endDate");
  if (contextModel === "schedule-kernel") {
    const sidecar = await input(values["calendar-exposure"]!);
    if (
      !object(sidecar) ||
      !object(sidecar.corpus) ||
      sidecar.corpus.sha256 !== bindings[0]!.sha256
    )
      throw Error("Calendar sidecar must bind the exact supplied corpus bytes");
    history = attachPlayerDayCalendarExposure(
      history as Array<DayImpactContext & { weekId: string }>,
      sidecar,
    );
    const targetContexts = attachPlayerDayCalendarExposure(
      Object.entries(contexts).map(([weekId, context]) => ({
        ...(context as PlayerDayImpactRatingOptions["contextsByWeekId"][string]),
        weekId,
      })),
      sidecar,
    );
    contexts = Object.fromEntries(
      targetContexts.map((context) => [context.weekId, context]),
    );
  }
  let historyStart: string | null = null;
  if (historyYears !== undefined) {
    const lower = new Date(trainedBefore);
    lower.setUTCFullYear(lower.getUTCFullYear() - historyYears);
    historyStart = lower.toISOString().slice(0, 10);
  }
  const selected = history.filter(
    (c) =>
      c.endDate < trainedBefore && (!historyStart || c.endDate >= historyStart),
  );
  const api = await loadPlayerDayImpact();
  const fitted = api.fitContexts(selected, {
    ...HISTORICAL_DAY_IMPACT_POLICY,
    trainedBefore,
    backgroundWeighting,
    countModel,
    ...(contextModel === "week-days"
      ? {}
      : { contextModel, exposureBandwidth }),
    ...(maxGoalieContexts === undefined ? {} : { maxGoalieContexts }),
  });
  // Preview the serialized reference, ensuring saved models are sufficient for replay.
  const modelJson = JSON.stringify(fitted, null, 2);
  const reference = api.hydrateReference(JSON.parse(modelJson));
  const ratingOptions = {
    contextsByWeekId:
      contexts as PlayerDayImpactRatingOptions["contextsByWeekId"],
    mutate: false,
    outputField,
    includeBreakdown:
      values["include-breakdown"] || values["include-actual-matchup-impact"],
    ...(values["include-actual-matchup-impact"]
      ? {
          actualMatchupsByWeekAndTeamId: actualMatchupsForRows(
            corpus.matchups,
            rows as DatabaseRecord[],
            contexts as PlayerDayImpactRatingOptions["contextsByWeekId"],
          ),
        }
      : {}),
  };
  const preview = await rankPlayerDayImpactRows(rows as DatabaseRecord[], {
    ...ratingOptions,
    reference,
  });
  const originalPreview = await rankPlayerDayImpactRows(
    rows as DatabaseRecord[],
    {
      ...ratingOptions,
      reference: fitted,
    },
  );
  if (JSON.stringify(preview) !== JSON.stringify(originalPreview))
    throw Error("Serialized reference scoring parity failed");
  for (const binding of [...bindings, ...codeBindings])
    if (sha256(await readFile(binding.path)) !== binding.sha256)
      throw Error("Input or calculation code changed during preview");

  await mkdir(dirname(output), { recursive: true });
  await mkdir(output); // Fail closed if the output already exists.
  const artifacts = [
    { name: "fitted-reference.json", bytes: modelJson },
    { name: "preview-rows.json", bytes: JSON.stringify(preview, null, 2) },
  ];
  for (const artifact of artifacts)
    await writeFile(resolve(output, artifact.name), artifact.bytes, {
      flag: "wx",
    });
  const manifest = {
    version: "player-day-impact-local-preview-v1",
    productionWrites: false,
    createdAt: new Date().toISOString(),
    inputs: bindings,
    codeBindings,
    policy: HISTORICAL_DAY_IMPACT_POLICY,
    fit: {
      trainedBefore,
      historyYears: historyYears ?? null,
      historyStart,
      backgroundWeighting,
      countModel,
      contextModel,
      exposureBandwidth: exposureBandwidth ?? null,
      maxGoalieContexts: maxGoalieContexts ?? null,
    },
    counts: {
      candidateContexts: history.length,
      trainingContexts: selected.length,
      excludedAtOrAfterCutoff: history.filter((c) => c.endDate >= trainedBefore)
        .length,
      excludedBeforeHistoryWindow: history.filter(
        (c) =>
          c.endDate < trainedBefore && historyStart && c.endDate < historyStart,
      ).length,
      previewRows: preview.length,
    },
    modelProvenance: reference.provenance,
    serializedReferenceScoringParity: true,
    actualMatchupDiagnostic: values["include-actual-matchup-impact"]
      ? "Completed corpus raw team/week totals used only for separate debug impact after the owner-independent main score; never used in reference fitting at/after cutoff."
      : null,
    calendarExposureChronology:
      contextModel === "schedule-kernel"
        ? CALENDAR_EXPOSURE_CHRONOLOGY_LIMITATION
        : null,
    outputField,
    artifacts: artifacts.map((a) => ({
      name: a.name,
      sha256: sha256(a.bytes),
    })),
  };
  await writeFile(
    resolve(output, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    { flag: "wx" },
  );
  return manifest;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  previewPlayerDayImpact(process.argv.slice(2)).then(
    (manifest) => {
      if (manifest) process.stdout.write(`${JSON.stringify(manifest)}\n`);
    },
    (error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "Preview failed"}\n`,
      );
      process.exitCode = 1;
    },
  );
}
