import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import type { DatabaseRecord } from "@gshl-lib/sheets/config/config";

type LineupBuilderApi = {
  optimizeLineup: (players: DatabaseRecord[]) => DatabaseRecord[];
  findBestLineup: (
    players: DatabaseRecord[],
    skipValidation?: boolean,
    slots?: ReadonlyArray<{
      position: string;
      eligiblePositions: readonly string[];
    }>,
  ) => Record<string, string>;
  internals?: {
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
  Logger: {
    log: (...args: unknown[]) => void;
  };
};

const CURRENT_FILE_DIR = path.dirname(fileURLToPath(import.meta.url));
const LINEUP_BUILDER_FILE = path.resolve(
  CURRENT_FILE_DIR,
  "../../runtime/apps-script/features/LineupBuilder.js",
);

let lineupBuilderPromise: Promise<LineupBuilderApi> | null = null;

async function loadLineupBuilder(): Promise<LineupBuilderApi> {
  const source = await fs.readFile(LINEUP_BUILDER_FILE, "utf8");
  const context = vm.createContext({
    console,
    Logger: {
      log: (...args: unknown[]) => console.log(...args),
    },
  }) as LineupBuilderContext;

  vm.runInContext(source, context, {
    filename: LINEUP_BUILDER_FILE,
  });

  const lineupBuilder = context.LineupBuilder;
  if (!lineupBuilder || typeof lineupBuilder.optimizeLineup !== "function") {
    throw new Error(
      "[lineup-builder] Failed to load Apps Script LineupBuilder.",
    );
  }

  return lineupBuilder;
}

export async function getAppsScriptLineupBuilder(): Promise<LineupBuilderApi> {
  lineupBuilderPromise ??= loadLineupBuilder();
  return lineupBuilderPromise;
}
