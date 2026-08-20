import fs from "node:fs";
import path from "node:path";
import {
  fetchModel,
  upsertByCompositeKey,
} from "../../integrations/data/convex-store";
import {
  parseSalaryCapOverrides,
  parseSalaryHistory,
  reconcileSalaryCandidates,
  type StoredSalaryPlayer,
} from "../../domains/maintenance/nhl-salaries";

const HELP_TEXT = `
Usage:
  npm run nhl-salaries:import
  npm run nhl-salaries:import -- --apply

Options:
  --file <path>          Salary-history JSON. Default: salaryHistory.json at
                         the repository root.
  --salary-cap Y=VALUE  Override/add a season cap; repeat when needed.
  --apply                Persist the validated rows. Default is a dry run.
  --help                 Show this help text.
`.trim();

function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(name);
}

function getArgValue(
  argv: readonly string[],
  name: string,
): string | undefined {
  const index = argv.indexOf(name);
  if (index >= 0) return argv[index + 1];
  const match = argv.find((argument) => argument.startsWith(`${name}=`));
  return match?.slice(name.length + 1);
}

function getArgValues(argv: readonly string[], name: string): string[] {
  const output: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === name && argv[index + 1]) output.push(argv[index + 1]!);
    if (argument.startsWith(`${name}=`)) {
      output.push(argument.slice(name.length + 1));
    }
  }
  return output;
}

function defaultHistoryPath(): string {
  const candidates = [
    path.resolve(process.cwd(), "salaryHistory.json"),
    path.resolve(process.cwd(), "..", "salaryHistory.json"),
  ];
  return (
    candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0]!
  );
}

function readJson(filePath: string): unknown {
  const buffer = fs.readFileSync(filePath);
  const utf16LittleEndian = buffer[0] === 0xff && buffer[1] === 0xfe;
  const text = (
    utf16LittleEndian
      ? buffer.subarray(2).toString("utf16le")
      : buffer.toString("utf8")
  ).replace(/^\uFEFF/, "");
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse ${filePath} as JSON: ${message}`, {
      cause: error,
    });
  }
}

async function main(argv: string[]): Promise<void> {
  if (hasFlag(argv, "--help")) {
    console.log(HELP_TEXT);
    return;
  }

  const filePath = path.resolve(
    getArgValue(argv, "--file") ?? defaultHistoryPath(),
  );
  const capOverrides = parseSalaryCapOverrides(
    getArgValues(argv, "--salary-cap"),
  );
  const candidates = parseSalaryHistory(
    readJson(filePath),
    path.basename(filePath),
  );
  if (candidates.length === 0) {
    throw new Error(
      `No salary rows were found in ${filePath}. Each row needs a player identity, season, and salary.`,
    );
  }

  const players = await fetchModel<StoredSalaryPlayer>("Player");
  const reconciliation = reconcileSalaryCandidates(
    candidates,
    players,
    capOverrides,
  );
  const summary = {
    dryRun: !hasFlag(argv, "--apply"),
    file: filePath,
    sourceRows: candidates.length,
    readyRows: reconciliation.rows.length,
    duplicateRows: reconciliation.duplicateRows,
    unmatchedRows: reconciliation.unmatched.length,
    ambiguousRows: reconciliation.ambiguous.length,
    seasons: Array.from(
      new Set(reconciliation.rows.map((row) => row.season)),
    ).sort(),
    missingCapRows: reconciliation.rows.filter((row) => row.salaryCap === null)
      .length,
    unmatchedSamples: reconciliation.unmatched.slice(0, 20),
    ambiguousSamples: reconciliation.ambiguous.slice(0, 20),
  };

  if (reconciliation.unmatched.length || reconciliation.ambiguous.length) {
    console.log(JSON.stringify(summary, null, 2));
    throw new Error(
      "Salary history contains unresolved player identities. No database changes were made.",
    );
  }
  if (!hasFlag(argv, "--apply")) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  const years = Array.from(
    new Set(reconciliation.rows.map((row) => row.seasonStartYear)),
  ).sort((left, right) => left - right);
  for (const year of years) {
    const rows = reconciliation.rows
      .filter((row) => row.seasonStartYear === year)
      .map((row) => ({ ...row }));
    const result = await upsertByCompositeKey(
      "PlayerNHLSalary",
      ["playerId", "seasonStartYear"],
      rows,
      { merge: true },
    );
    inserted += result.inserted;
    updated += result.updated;
    unchanged += result.unchanged;
  }

  console.log(
    JSON.stringify(
      { ...summary, dryRun: false, inserted, updated, unchanged },
      null,
      2,
    ),
  );
}

void main(process.argv.slice(2)).catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
