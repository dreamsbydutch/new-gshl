import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { readSalaryRatingSeason } from "../../integrations/nhl-salary-rating-snapshot";

const { values } = parseArgs({
  options: {
    target: { type: "string" },
    output: { type: "string" },
    seasons: { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help)
  console.log(
    "Read-only NHL salary/rating export from polished-tern-709. --target production --seasons <comma-separated start years 2013..2025> --output <NEW directory>. Exports historical NHL contract cap hits and v3 regular-season ratings. No database writes, GSHL salaries, or current-profile fallback.",
  );
else {
  if (values.target !== "production" || !values.seasons || !values.output)
    throw new Error(
      "Explicit production target, seasons and new output required",
    );
  const years = values.seasons.split(",").map(Number);
  if (
    new Set(years).size !== years.length ||
    years.some((y) => !Number.isInteger(y) || y < 2013 || y > 2025)
  )
    throw new Error("Invalid or duplicate season start years");
  const output = resolve(values.output);
  await mkdir(output);
  const seasons: unknown[] = [];
  for (const year of years) {
    const season = await readSalaryRatingSeason(year);
    seasons.push(season);
    await writeFile(
      resolve(output, `${year}.json`),
      JSON.stringify(season, null, 2),
      { flag: "wx" },
    );
    console.log(`Read ${year}-${String(year + 1).slice(-2)}`);
  }
  await writeFile(
    resolve(output, "snapshot.json"),
    JSON.stringify(
      {
        target: "polished-tern-709",
        exportedAt: new Date().toISOString(),
        seasons,
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
}
