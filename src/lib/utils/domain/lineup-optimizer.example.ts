/**
 * Example usage of lineup optimizer
 * ==================================
 * Run with: tsx src/lib/utils/lineup-optimizer.example.ts
 */

import { optimizeLineup, getLineupStats } from "./lineup-optimizer";
import type { LineupPlayer } from "./lineup-optimizer";
import { RosterPosition as Pos, PositionGroup } from "@gshl-types";

// Example: Team roster for a single day
const roster: LineupPlayer[] = [
  // Daily lineup forwards
  {
    playerId: "player1",
    nhlPos: [Pos.LW],
    posGroup: PositionGroup.F,
    dailyPos: Pos.LW,
    GP: 1,
    GS: 1,
    IR: 0,
    IRplus: 0,
    Rating: 75.5,
  },
  {
    playerId: "player2",
    nhlPos: [Pos.C],
    posGroup: PositionGroup.F,
    dailyPos: Pos.C,
    GP: 1,
    GS: 1,
    IR: 0,
    IRplus: 0,
    Rating: 68.2,
  },
  {
    playerId: "player3",
    nhlPos: [Pos.RW],
    posGroup: PositionGroup.F,
    dailyPos: Pos.RW,
    GP: 1,
    GS: 1,
    IR: 0,
    IRplus: 0,
    Rating: 82.1,
  },
  {
    playerId: "player4",
    nhlPos: [Pos.LW, Pos.C], // Multi-position eligible
    posGroup: PositionGroup.F,
    dailyPos: Pos.Util,
    GP: 1,
    GS: 1,
    IR: 0,
    IRplus: 0,
    Rating: 91.3, // High rating
  },

  // Daily lineup defense
  {
    playerId: "player5",
    nhlPos: [Pos.D],
    posGroup: PositionGroup.D,
    dailyPos: Pos.D,
    GP: 1,
    GS: 1,
    IR: 0,
    IRplus: 0,
    Rating: 72.8,
  },
  {
    playerId: "player6",
    nhlPos: [Pos.D],
    posGroup: PositionGroup.D,
    dailyPos: Pos.D,
    GP: 1,
    GS: 1,
    IR: 0,
    IRplus: 0,
    Rating: 65.4,
  },

  // Daily lineup goalie
  {
    playerId: "player7",
    nhlPos: [Pos.G],
    posGroup: PositionGroup.G,
    dailyPos: Pos.G,
    GP: 1,
    GS: 1,
    IR: 0,
    IRplus: 0,
    Rating: 58.9, // Below average goalie performance
  },

  // Bench players who played
  {
    playerId: "player8",
    nhlPos: [Pos.LW],
    posGroup: PositionGroup.F,
    dailyPos: Pos.BN,
    GP: 1,
    GS: 0,
    IR: 0,
    IRplus: 0,
    Rating: 88.7, // High rating but was benched!
  },
  {
    playerId: "player9",
    nhlPos: [Pos.C],
    posGroup: PositionGroup.F,
    dailyPos: Pos.BN,
    GP: 1,
    GS: 0,
    IR: 0,
    IRplus: 0,
    Rating: 79.2,
  },
  {
    playerId: "player10",
    nhlPos: [Pos.RW],
    posGroup: PositionGroup.F,
    dailyPos: Pos.BN,
    GP: 1,
    GS: 0,
    IR: 0,
    IRplus: 0,
    Rating: 85.6,
  },
  {
    playerId: "player11",
    nhlPos: [Pos.D],
    posGroup: PositionGroup.D,
    dailyPos: Pos.BN,
    GP: 1,
    GS: 0,
    IR: 0,
    IRplus: 0,
    Rating: 94.2, // Star defenseman on bench!
  },
  {
    playerId: "player12",
    nhlPos: [Pos.G],
    posGroup: PositionGroup.G,
    dailyPos: Pos.BN,
    GP: 1,
    GS: 0,
    IR: 0,
    IRplus: 0,
    Rating: 103.5, // Shutout performance on bench!
  },

  // Players who didn't play
  {
    playerId: "player13",
    nhlPos: [Pos.C],
    posGroup: PositionGroup.F,
    dailyPos: Pos.BN,
    GP: 0, // Did not play
    GS: 0,
    IR: 0,
    IRplus: 0,
    Rating: 0,
  },
  {
    playerId: "player14",
    nhlPos: [Pos.D],
    posGroup: PositionGroup.D,
    dailyPos: Pos.IR,
    GP: 0,
    GS: 0,
    IR: 1, // Injured
    IRplus: 0,
    Rating: 0,
  },
];

console.log("🏒 Lineup Optimizer Example\n");
console.log("=".repeat(80));
console.log("\n📋 Input Roster:");
console.log(`   Total players: ${roster.length}`);
console.log(
  `   Players who played: ${roster.filter((p) => p.GP > 0 && p.IR === 0 && p.IRplus === 0).length}`,
);
console.log(
  `   In daily lineup: ${roster.filter((p) => p.dailyPos !== Pos.BN && p.dailyPos !== Pos.IR && p.dailyPos !== Pos.IRPlus).length}`,
);
console.log(
  `   On bench: ${roster.filter((p) => p.dailyPos === Pos.BN).length}\n`,
);

// Optimize the lineup
const optimized = optimizeLineup(roster);
const stats = getLineupStats(optimized);

console.log("📊 Optimization Results:\n");
console.log("   fullPos (Daily lineup + bench fill-ins):");
console.log(`   Total Rating: ${stats.fullPosRating.toFixed(2)}`);

optimized
  .filter((p) => p.fullPos !== Pos.BN)
  .sort((a, b) => a.fullPos.localeCompare(b.fullPos))
  .forEach((p) => {
    const wasDaily = p.dailyPos !== Pos.BN ? "✓" : "BENCH";
    console.log(
      `     ${p.fullPos.padEnd(6)} - ${p.playerId.padEnd(10)} Rating: ${p.Rating.toFixed(1).padStart(5)} (${wasDaily})`,
    );
  });

console.log("\n   bestPos (Optimal lineup by rating):");
console.log(`   Total Rating: ${stats.bestPosRating.toFixed(2)}`);

optimized
  .filter((p) => p.bestPos !== Pos.BN)
  .sort((a, b) => a.bestPos.localeCompare(b.bestPos))
  .forEach((p) => {
    const changed = p.fullPos !== p.bestPos ? "⬆️ BETTER" : "";
    console.log(
      `     ${p.bestPos.padEnd(6)} - ${p.playerId.padEnd(10)} Rating: ${p.Rating.toFixed(1).padStart(5)} ${changed}`,
    );
  });

console.log("\n💡 Improvement:");
console.log(`   Points gained: ${stats.improvementPoints.toFixed(2)}`);
console.log(`   Percentage: ${stats.improvementPercent.toFixed(2)}%\n`);

console.log("=".repeat(80));
console.log("\n✅ Example complete!");
console.log("\nKey insights from this example:");
console.log(
  "  • fullPos prioritizes daily lineup players (even if lower rated)",
);
console.log("  • bestPos finds the mathematically optimal lineup");
console.log("  • The optimizer found a better lineup by using bench players");
console.log(
  "  • Player 12 (G, 103.5 rating) was benched but should have started!",
);
console.log(
  "  • Player 11 (D, 94.2 rating) would improve the lineup significantly",
);
