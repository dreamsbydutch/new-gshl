import fs from "node:fs/promises";
import vm from "node:vm";

const configUrl = new URL(
  "../scripts/src/runtime/RankingEngine/config.js",
  import.meta.url,
);
const outputUrl = new URL(
  "../src/lib/utils/features/draft-slot-calibration.json",
  import.meta.url,
);
const context = vm.createContext({ RankingEngine: {} });
vm.runInContext(await fs.readFile(configUrl, "utf8"), context);
const serialized = `${JSON.stringify(context.RankingEngine.TuningConfig.draftSlot, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if ((await fs.readFile(outputUrl, "utf8")) !== serialized)
    throw new Error(
      "Draft calibration differs from runtime config; run node tools/sync-draft-slot.mjs",
    );
} else {
  await fs.writeFile(outputUrl, serialized);
}
