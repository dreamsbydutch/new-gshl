# Player Performance Ranking Algorithm

A sophisticated, machine-learning-inspired ranking system that scores player daily performances from 0-100 based on historical data patterns.

## Overview

This ranking algorithm analyzes hundreds of thousands of player game logs across multiple seasons to create position-specific, season-normalized performance scores. The system automatically learns optimal statistical weights and distributions to produce fair, consistent rankings.

## Key Features

### 🎯 Position-Specific Weighting

- **Forwards & Defense**: Weighted on G, A, P, PPP, SOG, HIT, BLK
- **Goalies**: Weighted on W, GAA (inverted), SVP
- Weights are automatically calculated based on statistical variance and importance

### 📊 Season-Relative Scoring

- Rankings are relative to each season's distribution
- Accounts for league-wide scoring changes year-to-year
- Scores remain comparable across different eras

### 🔢 Percentile-Based System

- 0-100 scale represents percentile ranking
- 95+ = Elite (top 5%)
- 50 = Average (median performance)
- Easy to interpret and compare

### 📈 Statistical Rigor

- Coefficient of Variation for weight optimization
- Outlier detection and handling
- Distribution modeling with percentile tracking
- Cross-season normalization

## Quick Start

### 1. Install Dependencies

Already included in your project's dependencies.

### 2. Train the Model

```typescript
import { optimizedSheetsAdapter } from "@gshl/lib/sheets";
import { trainRankingModel, serializeModel } from "@gshl/lib/ranking";

// Fetch all PlayerDay records from all three workbooks
async function trainModel() {
  const statLines = await optimizedSheetsAdapter.findMany("PlayerDayStatLine");

  const model = trainRankingModel(statLines, {
    minSampleSize: 50, // Min games per position per season
    outlierThreshold: 4, // Z-score threshold
    smoothingFactor: 0.3, // Cross-season smoothing
    useAdaptiveWeights: false, // Set true if outcome data available
  });

  // Save model
  const json = serializeModel(model);
  await fs.writeFile("ranking-model.json", json);

  return model;
}
```

### 3. Rank Performances

```typescript
import { rankPerformance, getPerformanceGrade } from "@gshl/lib/ranking";
import type { PlayerDayStatLine } from "@gshl/lib/types";

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

### 4. Batch Ranking & Analysis

```typescript
import { rankPerformances } from "@gshl/lib/ranking";

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
5. **Normalize** so weights sum to number of relevant stats

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

| Position | Stats Used                  |
| -------- | --------------------------- |
| Forward  | G, A, P, PPP, SOG, HIT, BLK |
| Defense  | G, A, P, PPP, SOG, HIT, BLK |
| Goalie   | W, GAA (inverted), SVP      |

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
import { comparePerformances } from "@gshl/lib/ranking";

const result1 = rankPerformance(player1Day, model);
const result2 = rankPerformance(player2Day, model);

const comparison = comparePerformances(result1, result2);

console.log(`Score difference: ${comparison.scoreDifference}`);
console.log(`Better performance: Player ${comparison.betterPerformance}`);
```

### Custom Weight Training

```typescript
import { calculatePositionWeights } from "@gshl/lib/ranking";

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
import { rankPerformance } from "@gshl/lib/ranking";

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
import { getPerformanceGrade } from "@gshl/lib/ranking";
import type { RankingResult } from "@gshl/lib/ranking";

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

## Training Script

See `scripts/train-ranking-model.ts` for a complete example of:

- Fetching all PlayerDay data from partitioned workbooks
- Training the model with progress logging
- Validating model quality
- Saving to file system

## Future Enhancements

- [ ] Adaptive weights based on actual game outcomes
- [ ] Multi-day rolling averages
- [ ] Opponent strength adjustments
- [ ] Time-decay for older seasons
- [ ] Position-specific sub-categories (e.g., scoring vs. defensive forwards)
- [ ] Streaming model updates as new data arrives

## License

Part of the GSHL Next.js project.
