/**
 * Imports the public Yahoo Fantasy preseason ranks for GSHL league 44541.
 *
 * Usage:
 *   npm.cmd --prefix scripts run players:import-yahoo-preseason-rankings -- --target production
 *   npm.cmd --prefix scripts run players:import-yahoo-preseason-rankings -- --target production --apply
 */
import { load as loadHtml } from "cheerio";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import {
  configureConvexTarget,
  fetchModel,
  updateById,
} from "@gshl-lib/data/convex-store";
import { fetchYahooMatchupPage } from "@gshl-lib/yahoo/matchup-utils";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv();

const SOURCE_URL =
  "https://hockey.fantasysports.yahoo.com/hockey/44541/players";
const PAGE_SIZE = 25;
const MAX_PAGES = 100;
const PLAYER_GROUPS = ["P", "G"] as const;

type Player = Record<string, unknown> & {
  id: string;
  fullName?: string;
  yahooId?: string | null;
  yahooDraftRk?: number | null;
};

type YahooRank = { yahooId: string; fullName: string; rank: number };

function parseOptions(argv: string[]): {
  target: "production" | "development";
  apply: boolean;
} {
  const target = argv[argv.indexOf("--target") + 1];
  if (target !== "production" && target !== "development") {
    throw new Error("Pass --target development or --target production.");
  }
  return { target, apply: argv.includes("--apply") };
}

function buildPageUrl(
  offset: number,
  position: (typeof PLAYER_GROUPS)[number],
): string {
  const url = new URL(SOURCE_URL);
  url.search = new URLSearchParams({
    status: "A",
    eteam: "ALL",
    fteam: "NONE",
    pos: position,
    cut_type: "33",
    stat1: "S_S_2025",
    myteam: "0",
    sort: "OR",
    sdir: "1",
    count: String(offset),
  }).toString();
  return url.toString();
}

export function parseYahooPreseasonRanks(html: string): YahooRank[] {
  const $ = loadHtml(html);
  const rankColumn = $("th")
    .filter((_, element) =>
      $(element).text().replace(/\s+/g, " ").includes("Pre-Season"),
    )
    .first()
    .index();
  if (rankColumn < 0)
    throw new Error("Yahoo page did not contain a Pre-Season column.");

  const ranks: YahooRank[] = [];
  $("tr").each((_, element) => {
    const row = $(element);
    const anchor = row.find("a[data-ys-playerid]").first();
    const yahooId = anchor.attr("data-ys-playerid")?.trim();
    const fullName = anchor.text().replace(/\s+/g, " ").trim();
    const value = row
      .children("td")
      .eq(rankColumn)
      .text()
      .replace(/[\s,]/g, "");
    const rank = Number(value);
    if (yahooId && fullName && Number.isInteger(rank) && rank > 0) {
      ranks.push({ yahooId, fullName, rank });
    }
  });
  return ranks;
}

async function fetchAllRanks(): Promise<YahooRank[]> {
  const ranksByYahooId = new Map<string, YahooRank>();
  for (const position of PLAYER_GROUPS) {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const pageRanks = parseYahooPreseasonRanks(
        await fetchYahooMatchupPage(
          buildPageUrl(page * PAGE_SIZE, position),
          350,
        ),
      );
      if (pageRanks.length === 0) break;
      for (const entry of pageRanks) ranksByYahooId.set(entry.yahooId, entry);
      if (pageRanks.length < PAGE_SIZE) break;
    }
  }
  if (ranksByYahooId.size === 0)
    throw new Error("Yahoo returned no preseason ranks.");
  return [...ranksByYahooId.values()].sort(
    (left, right) => left.rank - right.rank,
  );
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const ranks = await fetchAllRanks();
  configureConvexTarget(options.target);
  const players = await fetchModel<Player>("Player");
  const playersByYahooId = new Map(
    players.flatMap((player) =>
      player.yahooId ? [[player.yahooId, player] as const] : [],
    ),
  );
  const matched = ranks.flatMap((entry) => {
    const player = playersByYahooId.get(entry.yahooId);
    return player ? [{ player, rank: entry.rank }] : [];
  });
  const updates = matched.filter(
    ({ player, rank }) => player.yahooDraftRk !== rank,
  );
  console.log(
    JSON.stringify(
      {
        source: SOURCE_URL,
        target: options.target,
        scraped: ranks.length,
        matched: matched.length,
        unmatchedYahoo: ranks.length - matched.length,
        updates: updates.length,
        sample: updates
          .slice(0, 20)
          .map(({ player, rank }) => ({ fullName: player.fullName, rank })),
      },
      null,
      2,
    ),
  );
  if (!options.apply) return;
  for (const { player, rank } of updates) {
    await updateById<Player>("Player", player.id, { yahooDraftRk: rank });
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
