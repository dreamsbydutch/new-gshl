import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { auditPlayerDayCompleteness } from "../../domains/stats/player-day-completeness";

const { values } = parseArgs({
  options: {
    "snapshot-dir": { type: "string" },
    cutoff: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
  },
});
const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
if (values.help) {
  console.log(
    "Audit GSHL player-day coverage from a complete verified operator snapshot. Read-only; never invents rosters or writes database rows. --snapshot-dir PATH --cutoff YYYY-MM-DD --output NEW_DIRECTORY. Requires inventory.json, players.json, week-snapshot-manifest.json and its SHA-256-bound week files. Produces report.json and roster-flags.csv; counts are review evidence, not proof of exact roster membership.",
  );
} else {
  if (!values["snapshot-dir"] || !values.cutoff || !values.output)
    throw Error("Snapshot directory, cutoff and new output directory required");
  const directory = resolve(values["snapshot-dir"]);
  const read = async (file: string) =>
    JSON.parse(await readFile(resolve(directory, file), "utf8"));
  const inventory = await read("inventory.json");
  const players = await read("players.json");
  const manifest = await read("week-snapshot-manifest.json");
  let franchiseRows: Array<{ _id: string; name?: string; abbr?: string }> = [];
  try {
    franchiseRows = await read("franchises.json");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (
    manifest.deployment !== inventory.deployment ||
    manifest.weeks.length !== inventory.weeks.length ||
    new Set(manifest.weeks.map((w: { weekId: string }) => w.weekId)).size !==
      inventory.weeks.length
  )
    throw Error("Incomplete week inventory");
  const rows = [];
  const inputHashes = [];
  if (franchiseRows.length) {
    const path = resolve(directory, "franchises.json");
    inputHashes.push({
      path,
      sha256: createHash("sha256")
        .update(await readFile(path))
        .digest("hex"),
    });
  }
  for (const file of [
    "inventory.json",
    "players.json",
    "week-snapshot-manifest.json",
  ]) {
    const path = resolve(directory, file);
    inputHashes.push({
      path,
      sha256: createHash("sha256")
        .update(await readFile(path))
        .digest("hex"),
    });
  }
  for (const week of inventory.weeks) {
    const entry = manifest.weeks.find(
      (w: { weekId: string }) => w.weekId === week._id,
    );
    if (!entry) throw Error("A calendar week is absent from the snapshot");
    const path = resolve(repositoryRoot, entry.path);
    const bytes = await readFile(path);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== entry.sha256)
      throw Error("Week snapshot differs from its reviewed digest");
    const parsed = JSON.parse(bytes.toString());
    if (
      parsed.length !== entry.rows ||
      parsed.some((r: { weekId: string }) => r.weekId !== week._id)
    )
      throw Error("Week snapshot population differs");
    rows.push(...parsed);
    inputHashes.push({ path, sha256 });
  }
  const audit = auditPlayerDayCompleteness({
    seasons: inventory.seasons,
    teams: inventory.teams,
    weeks: inventory.weeks,
    matchups: inventory.matchups,
    players,
    rows,
    cutoff: values.cutoff,
  });
  const output = resolve(values.output);
  await mkdir(output);
  const report = {
    deployment: inventory.deployment,
    capturedAt: inventory.capturedAt,
    inputHashes,
    codeHashes: await Promise.all(
      [
        "scripts/src/commands/stats/audit-player-day-completeness.ts",
        "scripts/src/domains/stats/player-day-completeness.ts",
      ].map(async (file) => ({
        path: file,
        sha256: createHash("sha256")
          .update(await readFile(resolve(repositoryRoot, file)))
          .digest("hex"),
      })),
    ),
    ...audit,
  };
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
    { flag: "wx" },
  );
  const seasons = new Map(
    inventory.seasons.map((s: { _id: string; name: string }) => [
      s._id,
      s.name,
    ]),
  );
  const teams = new Map(
    inventory.teams.map(
      (t: {
        _id: string;
        legacyId?: string;
        yahooId?: string;
        franchiseId?: string;
      }) => [t._id, t],
    ),
  );
  const csv = (value: unknown) =>
    '"' + String(value ?? "").replaceAll('"', '""') + '"';
  const flags = audit.rosterCountFlags;
  const franchises = new Map(franchiseRows.map((f) => [f._id, f]));
  const columns = [
    "season",
    "franchiseName",
    "franchiseAbbr",
    "teamId",
    "teamLegacyId",
    "yahooTeamId",
    "date",
    "count",
    "expectedRegularCapacity",
    "startingCapacity",
    "maximumCapacity",
    "countShortfall",
    "previousDateCount",
    "nextDateCount",
    "nearbyCountDrop",
    "reviewSeverity",
    "reasons",
  ];
  const csvRows = flags.map((r) => {
    const team = teams.get(r.teamId) as
      | { legacyId?: string; yahooId?: string; franchiseId?: string }
      | undefined;
    const item: Record<string, unknown> = {
      ...r,
      reasons: r.reasons.join("; "),
      season: seasons.get(r.seasonId),
      franchiseName: franchises.get(team?.franchiseId ?? "")?.name,
      franchiseAbbr: franchises.get(team?.franchiseId ?? "")?.abbr,
      teamLegacyId: team?.legacyId,
      yahooTeamId: team?.yahooId,
    };
    return columns.map((key) => csv(item[key])).join(",");
  });
  await writeFile(
    resolve(output, "roster-flags.csv"),
    [columns.join(","), ...csvRows].join("\n") + "\n",
    { flag: "wx" },
  );
  const inactiveRows = audit.inactivePostseasonTeamDates.map((r) => {
    const team = teams.get(r.teamId) as { franchiseId?: string } | undefined;
    return [
      seasons.get(r.seasonId),
      franchises.get(team?.franchiseId ?? "")?.name,
      r.teamId,
      r.date,
      r.storedCount,
      r.weekIds.join("; "),
      "No scheduled current or later postseason matchup",
    ]
      .map(csv)
      .join(",");
  });
  await writeFile(
    resolve(output, "inactive-postseason-dates.csv"),
    [
      "season,franchiseName,teamId,date,storedCount,weekIds,reason",
      ...inactiveRows,
    ].join("\n") + "\n",
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      deployment: inventory.deployment,
      rows: audit.scannedRows,
      missingTeamDates: audit.missingTeamDates.length,
      inactivePostseasonTeamDates: audit.inactivePostseasonTeamDates.length,
      lowRosterTeamDates: audit.lowRosterTeamDates.length,
      duplicatePlayerDates: audit.duplicates.length,
      invalidReferences: audit.invalidReferences.length,
      statHoleRows: audit.statHoles.length,
      output,
    }),
  );
}
