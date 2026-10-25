import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { readProductionOperatorQuery } from "../../integrations/data/production-operator-cli";
import { readUniformImpactInputs } from "../../integrations/ranking/uniform-impact";
import { fitSeasonImpactReference } from "../../domains/ranking/uniform-impact";
import { loadPeriodImpact } from "../../domains/ranking/period-impact";
import { parsePlayerDayCalendarExposure } from "../../domains/ranking/player-day-calendar-exposure";
import type { DayImpactContext } from "../../domains/ranking/player-day-impact";

const HELP = `Build a NEW frozen 0–100 GSHL performance rating reference.
Read-only production source: polished-tern-709. Never writes Convex data.

  --target production          Required explicit source environment.
  --reference-config PATH      Required hash-verified category-impact corpus/calendar.
  --through-season-id ID       Required completed legacy season ID (inclusive).
  --version VERSION            Required new gshl-performance-rating-100-vN version.
  --output PATH                Required NEW JSON file; existing files are never replaced.
  --help                       Show help without source reads.

Existing public rating scales must remain frozen. Review and version a new reference
before adopting it. Player days sample 128 canonical-ID midpoint appearances per
completed season; other periods use complete bounded published contribution cohorts.
Career references are captured at run time. All source values must use v3 units.
`;
type Row = Record<string, unknown>;
type Season = { id: string; legacyId: string; name: string; endDate: string };
type Appearance = DayImpactContext["home"]["appearances"][number] & {
  statLineId: string;
};
const sourceVersion = "gshl-category-impact-v3";
const periodTables = [
  "playerWeekStatLines",
  "playerSplitStatLines",
  "playerTotalStatLines",
  "teamDayStatLines",
  "teamWeekStatLines",
  "teamSeasonStatLines",
];
const careers = ["playerCareerSplitStatLines", "playerCareerTotalStatLines"];

function quantiles(values: readonly number[]) {
  if (values.length < 100 || values.some((v) => !Number.isFinite(v)))
    throw Error("At least 100 finite source values are required per reference");
  const sorted = [...values].sort((a, b) => a - b);
  return {
    sampleSize: sorted.length,
    sourceSha256: createHash("sha256")
      .update(JSON.stringify(sorted))
      .digest("hex"),
    knots: Array.from({ length: 1001 }, (_, i) => {
      const position = (i * (sorted.length - 1)) / 1000;
      const lower = Math.floor(position),
        upper = Math.ceil(position);
      return (
        Math.round(
          (sorted[lower]! +
            (sorted[upper]! - sorted[lower]!) * (position - lower)) *
            1e5,
        ) / 1e5
      );
    }),
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean" },
      target: { type: "string" },
      "reference-config": { type: "string" },
      "through-season-id": { type: "string" },
      version: { type: "string" },
      output: { type: "string" },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  const through = Number(values["through-season-id"]);
  if (
    values.target !== "production" ||
    !values["reference-config"] ||
    !values.output ||
    !Number.isSafeInteger(through) ||
    through < 1 ||
    !/^gshl-performance-rating-100-v[1-9]\d*$/.test(values.version ?? "")
  )
    throw Error(
      "Explicit production target, corpus, completed season, new version and output are required; see --help",
    );
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const seasons = (await readProductionOperatorQuery(`
    return (await ctx.db.query('seasons').take(100)).filter(s=>s.legacyId!==undefined&&Number(s.legacyId)>=1&&Number(s.legacyId)<=${through})
      .map(s=>({id:s._id,legacyId:s.legacyId,name:s.name,endDate:s.endDate}));
  `)) as Season[];
  seasons.sort((a, b) => Number(a.legacyId) - Number(b.legacyId));
  if (seasons.length !== through || seasons.some((s) => s.endDate >= today))
    throw Error("Reference requires contiguous, completed historical seasons");
  const cohorts: Record<string, number[]> = Object.fromEntries(
    periodTables.map((t) => [t, []]),
  );
  const sourceCounts: Record<string, Row[]> = Object.fromEntries(
    periodTables.map((t) => [t, []]),
  );
  for (const season of seasons) {
    const result = (await readProductionOperatorQuery(`
      const output={};
      for(const table of ${JSON.stringify(periodTables)}){
        const rows=await ctx.db.query(table).withIndex('by_seasonId',q=>q.eq('seasonId',${JSON.stringify(season.id)})).take(10001);
        if(rows.length===10001)throw Error('Historical rating season exceeds bounded read');
        output[table]={rows:rows.length,values:rows.filter(r=>r.ratingVersion==='${sourceVersion}'&&r.ratingAppearances>0&&typeof r.Rating==='number'&&Number.isFinite(r.Rating)).map(r=>r.Rating)};
      }return output;
    `)) as Record<string, { rows: number; values: number[] }>;
    for (const table of periodTables) {
      cohorts[table]!.push(...result[table]!.values);
      sourceCounts[table]!.push({
        season: season.name,
        rows: result[table]!.rows,
        rated: result[table]!.values.length,
      });
    }
    console.log(`Read completed reference periods: ${season.name}`);
  }
  for (const table of careers) {
    cohorts[table] = [];
    let cursor: string | null = null;
    for (let batch = 0; batch < 100; batch++) {
      const page = (await readProductionOperatorQuery(`
        const page=await ctx.db.query('${table}').paginate({numItems:1000,cursor:${JSON.stringify(cursor)}});
        return {values:page.page.filter(r=>r.ratingVersion==='${sourceVersion}'&&r.ratingAppearances>0&&typeof r.Rating==='number'&&Number.isFinite(r.Rating)).map(r=>r.Rating),cursor:page.continueCursor,done:page.isDone};
      `)) as { values: number[]; cursor: string; done: boolean };
      cohorts[table]!.push(...page.values);
      if (page.done) break;
      cursor = page.cursor;
      if (batch === 99)
        throw Error("Career reference exceeds bounded page count");
    }
  }
  const inputs = await readUniformImpactInputs(values["reference-config"]);
  const api = await loadPeriodImpact();
  const exposures = new Map(
    parsePlayerDayCalendarExposure(inputs.exposure).map((w) => [w.weekId, w]),
  );
  const days: number[] = [],
    daySources: Row[] = [];
  for (const season of seasons) {
    const contexts = inputs.corpus.matchups.filter(
      (m) => m.seasonId === season.id,
    ) as unknown as Array<DayImpactContext & { weekId: string }>;
    const appearances = contexts.flatMap((m) =>
      [m.home, m.away].flatMap((side) =>
        side.appearances.map((a) => ({ a: a as Appearance, m })),
      ),
    );
    appearances.sort((a, b) => a.a.statLineId.localeCompare(b.a.statLineId));
    const count = Math.min(128, appearances.length);
    if (count !== 128)
      throw Error("A historical season lacks daily reference coverage");
    const reference = await fitSeasonImpactReference(inputs, season.id);
    for (let i = 0; i < count; i++) {
      const { a, m } =
        appearances[Math.floor(((i + 0.5) * appearances.length) / count)]!;
      const exposure = exposures.get(m.weekId);
      if (!exposure)
        throw Error("Daily reference lacks canonical calendar exposure");
      const scored = api.scoreBlock(
        {
          role: a.role,
          raw: a.raw,
          availableFields: a.availableFields,
          skaterAppearances: a.role === "skater" ? 1 : 0,
          goalieAppearances: a.role === "goalie" ? 1 : 0,
        },
        reference,
        {
          categories: [...m.categories],
          goalieMinimum: season.legacyId === "1" ? 1 : 2,
          weekDays: m.calendarDays,
          nhlGamesPerTeam: exposure.meanGamesPerNhlTeam,
          blockKind: "replacement",
        },
      );
      if (scored.status !== "rated" || scored.value === null)
        throw Error(
          "Unrated sampled daily source; refusing biased calibration",
        );
      days.push(Math.round(100 * scored.value * 1e5) / 1e5);
    }
    daySources.push({
      season: season.name,
      available: appearances.length,
      sampled: count,
    });
    console.log(`Scored historical daily sample: ${season.name}`);
  }
  const periods = Object.fromEntries(
    Object.entries(cohorts).map(([table, rows]) => [
      table,
      { ...quantiles(rows), sources: sourceCounts[table] ?? [] },
    ]),
  );
  periods.playerDayStatLines = { ...quantiles(days), sources: daySources };
  await writeFile(
    values.output,
    JSON.stringify(
      {
        version: values.version,
        sourceVersion,
        policy:
          "Frozen historical percentile reference by period; all positions and teams share each period scale; no live-cohort fitting; no averaging or addition of shorter-period ratings",
        historicalSeasons: `${seasons[0]!.name} through ${seasons.at(-1)!.name}`,
        careerSnapshotDate: today,
        periods,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  console.log(
    "New reference written; existing scales and production data were not modified.",
  );
}

main().catch(() => {
  console.error(
    "Rating reference generation failed; private source diagnostics suppressed. See --help for required inputs.",
  );
  process.exitCode = 1;
});
