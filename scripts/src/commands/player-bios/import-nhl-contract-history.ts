import fs from "node:fs";
import path from "node:path";
import {
  configureConvexTarget,
  fetchModel,
  syncNhlContractHistory,
} from "../../integrations/data/convex-store";
import {
  groupNhlContracts,
  parseNhlContractHistory,
  reconcileNhlContracts,
  parseNhlContractPlayerMappings,
} from "../../domains/maintenance/nhl-contracts";
import type { StoredSalaryPlayer } from "../../domains/maintenance/nhl-salaries";

const HELP = `Import NHL contract-season JSON (dry run by default).
  --file <path>        Required JSON array; Season uses the END year.
  --validate-only      Audit the file without contacting Convex.
  --match-only         Audit player matches without requiring the new tables.
  --target <target>    production (default) or development; explicit for --apply.
  --report <path>      Write the full audit as JSON locally.
  --player-map <path>  Reviewed identity mappings with evidence and reasons.
  --apply              Upsert contracts and seasons after a successful preview.
  --help               Show this help.`;

function arg(argv: string[], key: string): string | undefined {
  const index = argv.indexOf(key);
  return index >= 0
    ? argv[index + 1]
    : argv.find((a) => a.startsWith(`${key}=`))?.slice(key.length + 1);
}

async function main(argv: string[]) {
  if (argv.includes("--help")) {
    console.log(HELP);
    return;
  }
  const file = arg(argv, "--file");
  if (!file) throw new Error("--file is required");
  const reportPath = arg(argv, "--report");
  if (
    reportPath &&
    path.resolve(reportPath).toLowerCase() === path.resolve(file).toLowerCase()
  )
    throw new Error("Report must not overwrite the source file");
  const apply = argv.includes("--apply");
  const validateOnly = argv.includes("--validate-only");
  const matchOnly = argv.includes("--match-only");
  if (apply && (validateOnly || matchOnly))
    throw new Error("--apply cannot be combined with audit-only modes");
  const target = arg(argv, "--target") ?? "production";
  if (target !== "production" && target !== "development")
    throw new Error("Invalid --target");
  if (apply && !arg(argv, "--target"))
    throw new Error("--apply requires an explicit --target");
  const buffer = fs.readFileSync(path.resolve(file));
  const text =
    buffer[0] === 0xff && buffer[1] === 0xfe
      ? buffer.subarray(2).toString("utf16le")
      : buffer.toString("utf8");
  const input: unknown = JSON.parse(text.replace(/^\uFEFF/, ""));
  const audit = parseNhlContractHistory(input, path.basename(file));
  const report: Record<string, unknown> = {
    dryRun: !apply,
    target: validateOnly ? "local-file" : target,
    sourceRows: Array.isArray(input) ? input.length : 0,
    readySeasonRows: audit.rows.length,
    blankRows: audit.blankRows,
    duplicateRows: audit.duplicateRows,
    contractIds: new Set(audit.rows.map((r) => r.historicalContractId)).size,
    errorCount: audit.errors.length,
    warningCount: audit.warnings.length,
    errors: audit.errors,
    warnings: audit.warnings,
  };
  const print = () => {
    if (reportPath) {
      fs.mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
      fs.writeFileSync(
        path.resolve(reportPath),
        JSON.stringify(report, null, 2) + "\n",
      );
    }
    console.log(
      JSON.stringify(
        {
          ...report,
          errors: audit.errors.slice(0, 20),
          warnings: audit.warnings.slice(0, 20),
          playerMappings: Array.isArray(report.playerMappings)
            ? report.playerMappings.slice(0, 5)
            : undefined,
          unresolved: Array.isArray(report.unresolved)
            ? report.unresolved.slice(0, 20)
            : undefined,
        },
        null,
        2,
      ),
    );
  };
  if (audit.errors.length || !audit.rows.length) {
    print();
    throw new Error("Invalid contract history; no database changes made");
  }
  if (validateOnly) {
    print();
    return;
  }
  configureConvexTarget(target);
  const players = await fetchModel<StoredSalaryPlayer>("Player");
  const mappingPath = arg(argv, "--player-map");
  const mappings = mappingPath
    ? parseNhlContractPlayerMappings(
        JSON.parse(
          fs
            .readFileSync(path.resolve(mappingPath), "utf8")
            .replace(/^\uFEFF/, ""),
        ),
      )
    : [];
  const reconciled = reconcileNhlContracts(audit.rows, players, mappings);
  report.reviewedIdentityRows = reconciled.mappedRows;
  report.playerMappingCount = mappings.length;
  report.playerMappings = mappings;
  report.matchedSeasons = reconciled.rows.length;
  report.matchedContracts = groupNhlContracts(reconciled.rows).length;
  report.unresolvedRows = reconciled.unresolved.length;
  report.unresolved = reconciled.unresolved;
  if (reconciled.unresolved.length) {
    print();
    throw new Error("Unresolved player identities; no database changes made");
  }
  if (matchOnly) {
    print();
    return;
  }
  const progress = (phase: string) => (completed: number, total: number) => {
    if (completed % 100 === 0 || completed === total)
      console.log(`${phase}: ${completed}/${total} contracts`);
  };
  report.preview = await syncNhlContractHistory(
    reconciled.rows,
    false,
    progress("Preview"),
  );
  print();
  if (apply) {
    report.applied = await syncNhlContractHistory(
      reconciled.rows,
      true,
      progress("Import"),
    );
    const verification = await syncNhlContractHistory(
      reconciled.rows,
      false,
      progress("Verify"),
    );
    report.verification = verification;
    print();
    if (
      verification.contractsInserted ||
      verification.contractsUpdated ||
      verification.seasonsInserted ||
      verification.seasonsUpdated
    ) {
      throw new Error(
        "Import completed, but verification found remaining differences; review the audit before retrying",
      );
    }
  }
}

void main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "NHL contract import failed",
  );
  process.exitCode = 1;
});
