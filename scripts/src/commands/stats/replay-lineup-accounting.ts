import { parseArgs } from "node:util";
import { replayLineupAccountingPlan } from "../../integrations/data/lineup-accounting-repair";

async function main() {
  const { values } = parseArgs({
    options: {
      plan: { type: "string" },
      backup: { type: "string" },
      apply: { type: "boolean", default: false },
      verify: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(
      "Replay a reviewed MS/BS/MG plan against production polished-tern-709.\n--plan <directory> Required checksum-verified plan\n--backup <directory> Independent snapshot/ and plan/ backup, required with --apply\n--apply Write flag/optimized-position patches after complete preflight (default: dry run)\n--verify Require every reviewed patch to be already applied\n--help Show this help",
    );
    return;
  }
  if (!values.plan || (values.apply && values.verify))
    throw Error("Provide --plan and select apply or verify");
  console.log(
    JSON.stringify(
      await replayLineupAccountingPlan({
        plan: values.plan,
        backup: values.backup,
        apply: values.apply,
        verify: values.verify,
      }),
    ),
  );
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Lineup accounting repair failed",
  );
  process.exitCode = 1;
});
