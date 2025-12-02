import { readFile, writeFile } from "fs/promises";

import type { RankingModel } from "../lib/ranking/index.js";
import { deriveAggregationBlendWeights } from "./utils/aggregation-blend-calculator";
import { tuneGoalieWinWeights } from "./utils/goalie-weight-tuner";

const MODEL_PATH = "./ranking-model.json";

async function main() {
  const raw = await readFile(MODEL_PATH, "utf-8");
  const model = JSON.parse(raw) as RankingModel;

  const aggregationBlendWeights = deriveAggregationBlendWeights(model);
  const updated = {
    ...model,
    aggregationBlendWeights,
  } satisfies RankingModel & {
    aggregationBlendWeights: typeof aggregationBlendWeights;
  };

  const tuned = tuneGoalieWinWeights(updated);

  await writeFile(MODEL_PATH, JSON.stringify(tuned, null, 2));
  console.log(
    `✨ Refreshed aggregation blends and goalie win weights for ${Object.keys(aggregationBlendWeights).length} aggregation levels at ${MODEL_PATH}`,
  );
}

main().catch((error) => {
  console.error("Failed to update aggregation blend weights:", error);
  process.exitCode = 1;
});
