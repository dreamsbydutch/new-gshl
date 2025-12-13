# Player Performance Ranking Algorithm

A sophisticated, machine-learning-inspired ranking system that scores player daily performances from 0-100 based on historical data patterns.

## Overview

This ranking engine now analyzes every player and team stat line we track (daily, weekly, seasonal splits/totals, and NHL baselines) across hundreds of thousands of records. Each sample is classified by aggregation level, season phase (Regular Season, Playoffs, Losers), and entity type before training, producing position-specific, phase-aware models with reliable fallbacks.

**Implementation split:**

- `src/lib/ranking/*` – TypeScript source used by the Next.js app, data scripts, and the training/export pipeline.
- `apps-script/features/ranking/RankingEngine.js` – Apps Script runtime that consumes the exported model blob (see `RankingConfig.js` + generated `RankingModels.js`).
- `npm run ranking:export-to-apps-script` – Copies `ranking-model.json` into the Apps Script folder so `rankPerformance` stays consistent between environments.

## Key Features

### 🎯 Position-Specific & Scoreboard-Aware Weighting

- **Forwards & Defense**: Weighted on G, A, P, PPP, SOG, HIT, BLK
- **Goalies**: Weighted on W, GAA (inverted), SVP plus situational goalie stats
- **Teams**: Full skater + goalie categories with scoreboard-aware multipliers
- Weights blend coefficient-of-variation scarcity with matchup impact (how hard a category swings a week)
- Goalie wins are tuned per aggregation: ~5% of a daily score, ~15% weekly, and still capped below other categories for season-long models so shot volume/save rate dominate the grade
- Added midpoint compression on the percentile-to-score curve so the middle of the distribution sits lower without touching the peak or bottom of the scale

### 📊 Season + Phase-Relative Scoring

- Models are keyed by `seasonPhase:seasonId:aggregationLevel:posGroup`
- Regular Season, Playoffs, and Losers Bracket get dedicated distributions
- Automatic fallback to the closest season/phase keeps rankings available even with sparse data

### 🧮 Aggregation-Level Awareness

- Supports player day/week/split/total, NHL reference seasons, and all team levels
- Trainer normalizes cumulative stats per game so daily vs weekly vs season totals stay comparable
- Runtime auto-detects aggregation level and uses the matching model/fallback
- Aggregation blend weights (how much we emphasize spike performances vs consistency) are now generated directly from the full training dataset per aggregation + position group, then shipped with every `ranking-model.json` export

### 🔢 Percentile-Based System

- 0-100 scale represents percentile ranking
- 95+ = Elite (top 5%)
- 50 = Average (median performance)
- Easy to interpret and compare

### 📈 Statistical Rigor

- Coefficient of Variation + scoreboard multipliers drive weights
- Outlier detection and handling
- Distribution modeling with percentile tracking
- Cross-season, cross-phase weighting with exponential decay

## Quick Start

### 1. Install Dependencies

Already included in your project's dependencies.

### 2. Train the Model

> Preferred: run `npm run ranking:train`, which orchestrates the full workflow (fetch player + team sheets, derive week metadata, compute scarcity + scoreboard weights, and write `ranking-model.json`).

If you need to script it manually:

```typescript
import { trainRankingModel, serializeModel } from "@gshl-ranking";

async function trainModel(allStatLines: Array<Record<string, unknown>>) {
  const model = trainRankingModel(allStatLines, {
    minSampleSize: 50,
    outlierThreshold: 4,
    smoothingFactor: 0.3,
    scarcityWeights, // optional: team variance multipliers
    categoryImpactWeights, // optional: scoreboard multipliers
    weekTypeLookup, // map weekId -> SeasonType for RS/PO splits
  });

  await fs.promises.writeFile("ranking-model.json", serializeModel(model));
  return model;
}
```

### 3. Rank Performances

```typescript
import { rankPerformance, getPerformanceGrade } from "@gshl-ranking";
import type { PlayerDayStatLine } from "@gshl-types";

async function scorePlayerDay(playerDay: PlayerDayStatLine) {
  const model = await loadModel();

  const result = rankPerformance(playerDay, model);

  console.log(`Score: ${result.score.toFixed(1)}/100`);
  console.log(`Grade: ${getPerformanceGrade(result.score)}`);
  console.log(`Percentile: ${result.percentile.toFixed(1)}th`);

  // Breakdown by stat
  result.breakdown.forEach((stat) => {
    console.log(
      `${stat.category}: ${stat.value} ` +
        `(${stat.percentile.toFixed(1)}th percentile, ` +
        `weight: ${stat.weight.toFixed(2)})`,
    );
  });

  return result;
}
```

### Metadata & Classification

`rankPerformance` now returns:

- `aggregationLevel`: which dataset the input matched (`playerDay`, `playerWeek`, `playerSplit`, `playerTotal`, `playerNhl`, `teamDay`, `teamWeek`, `teamSeason`).
- `seasonPhase`: `REGULAR_SEASON`, `PLAYOFFS`, or `LOSERS_TOURNAMENT`.
- `entityType`: `player` or `team`.

Under the hood, each stat line is classified using fields like `date`, `weekId`, `seasonType`, `gshlTeamId`, and NHL-only attributes. Models are keyed by `seasonPhase:seasonId:aggregationLevel:posGroup`, with automatic fallback to the closest available phase/season if an exact match does not exist.

### 4. Batch Ranking & Analysis

```typescript
import { rankPerformances } from "@gshl-ranking";

async function analyzeWeek(weekId: string, seasonId: string) {
  const weekStats = await optimizedSheetsAdapter.findMany("PlayerDayStatLine", {
    where: { weekId, seasonId },
  });

  const rankings = rankPerformances(weekStats, model);

  // Find top performers
  const topPerformances = rankings
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  // Position leaders
  const positionLeaders = {
    F: rankings
      .filter((r) => r.posGroup === "F")
      .sort((a, b) => b.score - a.score)[0],
    D: rankings
      .filter((r) => r.posGroup === "D")
      .sort((a, b) => b.score - a.score)[0],
    G: rankings
      .filter((r) => r.posGroup === "G")
      .sort((a, b) => b.score - a.score)[0],
  };

  return { topPerformances, positionLeaders };
}
```

## Architecture

### File Structure

```
src/lib/ranking/
├── index.ts                  # Main exports and documentation
├── types.ts                  # TypeScript type definitions
├── stats-utils.ts            # Statistical utility functions
├── weight-calculator.ts      # Position weight optimization
├── model-trainer.ts          # Model training logic
└── ranking-engine.ts         # Performance ranking engine
```

```
apps-script/features/ranking/
├── RankingConfig.js          # Minimal runtime config + helpers for Apps Script
├── RankingEngine.js          # Google Apps Script runtime wrapper
└── RankingModels.js          # Generated JSON blob from ranking-model.json
```

The Apps Script files are transpiled JS mirrors of the TypeScript implementation. Run `npm run ranking:export-to-apps-script` after training to refresh `RankingModels.js` so the deployed script and the Next.js app score performances with the same data.

### Data Flow

```
Historical PlayerDay Data
         ↓
    Model Trainer
    - Group by Season & Position
    - Calculate Weights
    - Build Distributions
         ↓
   Trained Model (JSON)
         ↓
   Ranking Engine
    - Parse Stat Line
    - Apply Weights
    - Calculate Percentile
         ↓
   Ranking Result (0-100)
```

## Algorithm Details

### Weight Calculation

For each position and season:

1. **Filter** stat lines to position group
2. **Calculate** coefficient of variation for each stat:
   ```
   CV = σ / μ
   ```
3. **Assign** initial weights based on CV (higher variance = more discriminating)
4. **Apply** position-specific adjustments:
   - Forwards: +10% to Goals, +5% to PPP
   - Defense: +15% to Blocks, +10% to Hits
   - Goalies: +20% to SVP, +10% to GAA
5. **Blend** team-level scarcity + scoreboard category impact multipliers
6. **Normalize** so weights sum to number of relevant stats

### Composite Scoring

For a given performance:

```typescript
score = Σ(stat_value * weight);

// Special case: GAA is inverted for goalies
if (posGroup === "G") {
  score += -GAA * weight_GAA;
}
```

### Percentile Normalization

```typescript
percentile = ((score - season_min) / (season_max - season_min)) * 100;
final_score = clip(percentile, 0, 100);
```

### Position-Specific Stats

| Position | Stats Used                                         |
| -------- | -------------------------------------------------- |
| Forward  | G, A, P, PPP, SOG, HIT, BLK                        |
| Defense  | G, A, P, PPP, SOG, HIT, BLK                        |
| Goalie   | W, GAA (inverted), GA, SVP, SA, SV, SO, TOI        |
| Team     | G, A, P, PPP, SOG, HIT, BLK, W, GAA (inverted), GA |

## Performance Grades

| Score  | Grade         | Interpretation      |
| ------ | ------------- | ------------------- |
| 95-100 | Elite         | Top 5% performance  |
| 90-94  | Excellent     | Top 10% performance |
| 80-89  | Great         | Top 20% performance |
| 70-79  | Good          | Top 30% performance |
| 60-69  | Above Average | Better than half    |
| 50-59  | Average       | Around median       |
| 40-49  | Below Average | Below median        |
| 30-39  | Poor          | Bottom 30%          |
| 20-29  | Very Poor     | Bottom 20%          |
| 0-19   | Minimal       | Bottom 10%          |

## Advanced Usage

### Comparing Performances

```typescript
import { comparePerformances } from "@gshl-ranking";

const result1 = rankPerformance(player1Day, model);
const result2 = rankPerformance(player2Day, model);

const comparison = comparePerformances(result1, result2);

console.log(`Score difference: ${comparison.scoreDifference}`);
console.log(`Better performance: Player ${comparison.betterPerformance}`);
```

### Custom Weight Training

```typescript
import { calculatePositionWeights } from "@gshl-ranking";

// Train custom weights for specific season
const seasonStats = allStats.filter((s) => s.seasonId === "season_12");
const forwardStats = seasonStats.filter((s) => s.posGroup === "F");

const weights = calculatePositionWeights(
  forwardStats.map(parseStats),
  PositionGroup.F,
);
```

### Model Inspection

```typescript
const model = deserializeModel(modelJson);

console.log(`Trained on ${model.totalSamples} samples`);
console.log(
  `Season range: ${model.seasonRange.earliest} - ${model.seasonRange.latest}`,
);

// Inspect season 12 forward model
const s12fModel = model.models["season_12:F"];
console.log("Weights:", s12fModel.weights);
console.log("Sample size:", s12fModel.sampleSize);
console.log("Composite distribution:", s12fModel.compositeDistribution);
```

## Integration Points

### Add Ranking to tRPC Router

```typescript
// src/server/api/routers/player-stats.ts
import { rankPerformance } from "@gshl-ranking";

export const playerStatsRouter = createTRPCRouter({
  getRankedPlayerDay: publicProcedure
    .input(
      z.object({
        playerId: z.string(),
        seasonId: z.string(),
        date: z.date(),
      }),
    )
    .query(async ({ input }) => {
      const statLine = await optimizedSheetsAdapter.findUnique(
        "PlayerDayStatLine",
        { where: input },
      );

      const model = await loadRankingModel();
      const ranking = rankPerformance(statLine, model);

      return { statLine, ranking };
    }),
});
```

### Display in UI Components

```typescript
// src/components/PlayerDayCard/main.tsx
import { getPerformanceGrade } from "@gshl-ranking";
import type { RankingResult } from "@gshl-ranking";

export function PlayerDayCard({
  statLine,
  ranking
}: {
  statLine: PlayerDayStatLine;
  ranking: RankingResult;
}) {
  return (
    <div className="card">
      <h3>{statLine.playerId}</h3>
      <div className="score">
        {ranking.score.toFixed(1)}/100
      </div>
      <div className="grade">
        {getPerformanceGrade(ranking.score)}
      </div>
      {/* ... */}
    </div>
  );
}
```

## Training & Export Scripts

- `npm run ranking:train`

  - Fetches PlayerDay/Week/Split/Total/NHL plus TeamDay/Week/Season sheets
  - Builds a week-type lookup so RS/PO/LT samples are classified correctly
  - Computes scarcity + scoreboard multipliers and feeds them into the trainer
  - Trains every aggregation-level/phase/position model and writes `ranking-model.json`
  - Prints validation coverage (counts per phase/aggregation)

- `npm run ranking:export-to-apps-script`
  - Converts `ranking-model.json` into `src/server/apps-script/RankingModels.js`
  - Adds helper utilities for the Apps Script runtime to resolve the new model keys
  - Must be re-run after each training session before deploying Apps Script code

## Future Enhancements

- [ ] Adaptive weights based on actual game outcomes
- [ ] Multi-day rolling averages
- [ ] Opponent strength adjustments
- [ ] Time-decay for older seasons
- [ ] Position-specific sub-categories (e.g., scoring vs. defensive forwards)
- [ ] Streaming model updates as new data arrives

## License

Part of the GSHL Next.js project.
