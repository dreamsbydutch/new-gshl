import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import type { DatabaseRecord } from "@gshl-lib/data/records";

type LineupBuilderApi = {
  optimizeLineup: (
    players: DatabaseRecord[],
    slots?: ReadonlyArray<{
      position: string;
      eligiblePositions: readonly string[];
    }>,
  ) => DatabaseRecord[];
  buildLineupStructureFromRosterSpots?: (
    rosterSpots: unknown[],
  ) => ReadonlyArray<{
    position: string;
    eligiblePositions: readonly string[];
  }>;
  findBestLineup: (
    players: DatabaseRecord[],
    skipValidation?: boolean,
    slots?: ReadonlyArray<{
      position: string;
      eligiblePositions: readonly string[];
    }>,
  ) => Record<string, string>;
  internals?: {
    buildLineupStructureFromRosterSpots?: (
      rosterSpots: unknown[],
    ) => ReadonlyArray<{
      position: string;
      eligiblePositions: readonly string[];
    }>;
    isEligibleForPosition?: (
      player: DatabaseRecord,
      eligiblePositions: string[],
    ) => boolean;
    validateTeamDayRoster?: (
      players: DatabaseRecord[],
      contextLabel?: string,
    ) => void;
  };
};

type LineupBuilderContext = vm.Context & {
  LineupBuilder?: LineupBuilderApi;
};

const CURRENT_FILE_DIR = path.dirname(fileURLToPath(import.meta.url));
const LINEUP_BUILDER_FILE = path.resolve(
  CURRENT_FILE_DIR,
  "../../runtime/LineupBuilder.js",
);

let lineupBuilderPromise: Promise<LineupBuilderApi> | null = null;

async function loadLineupBuilder(): Promise<LineupBuilderApi> {
  const source = await fs.readFile(LINEUP_BUILDER_FILE, "utf8");
  const context = vm.createContext({
    console,
  }) as LineupBuilderContext;

  vm.runInContext(source, context, {
    filename: LINEUP_BUILDER_FILE,
  });

  const lineupBuilder = context.LineupBuilder;
  if (!lineupBuilder || typeof lineupBuilder.optimizeLineup !== "function") {
    throw new Error("[lineup-builder] Failed to load local LineupBuilder.");
  }

  return lineupBuilder;
}

export async function getLineupBuilder(): Promise<LineupBuilderApi> {
  lineupBuilderPromise ??= loadLineupBuilder();
  return lineupBuilderPromise;
}
