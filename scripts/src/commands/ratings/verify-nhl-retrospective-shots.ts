import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { loadAuditedRetrospectiveShots } from "../../integrations/nhl/retrospective-shot-source";

const { values } = parseArgs({
  options: {
    directory: { type: "string" },
    rows: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help)
  console.log(
    "Offline retrospective whole-game OOF audit. --directory <crossfit report> --rows <source shot-rows.json> --output <NEW audit.json>. Independently verifies all-row fold identity, source/model hashes and numeric inference. Never forward validation; no remote writes.",
  );
else {
  if (!values.directory || !values.rows || !values.output)
    throw Error("--directory, --rows and --output required");
  const { audit } = await loadAuditedRetrospectiveShots(
    resolve(values.directory),
    resolve(values.rows),
  );
  await writeFile(
    resolve(values.output),
    JSON.stringify(audit, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(JSON.stringify(audit));
}
