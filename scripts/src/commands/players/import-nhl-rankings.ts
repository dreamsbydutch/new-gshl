import { config as loadEnv } from "dotenv";
import path from "node:path";
import {
  configureConvexTarget,
  fetchModel,
  updateById,
} from "@gshl-lib/data/convex-store";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv();

const SOURCE_URL =
  "https://www.nhl.com/news/topic/fantasy/nhl-fantasy-hockey-top-250-200-rankings-drafts-players-big-board-281505474";

type Player = Record<string, unknown> & {
  id: string;
  fullName?: string;
  nhlPos?: string[] | null;
  nhlRk?: number | null;
};

function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseOptions(argv: string[]) {
  const target = argv[argv.indexOf("--target") + 1];
  if (target !== "production" && target !== "development") {
    throw new Error("Pass --target development or --target production.");
  }
  return { target, apply: argv.includes("--apply") };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const html = await (await fetch(SOURCE_URL)).text();
  const top250 = [...html.matchAll(/(\d+)\.\s+([^,<]+),\s+[FDG],\s+[A-Z]{2,3}/g)]
    .map((match) => ({ rank: Number(match[1]), name: match[2].trim() }))
    .filter((entry) => entry.rank >= 1 && entry.rank <= 250);
  if (top250.length !== 250 || new Set(top250.map((entry) => entry.rank)).size !== 250) {
    throw new Error(`Expected the NHL.com Top 250; parsed ${top250.length} ranks.`);
  }
  const othersSection = html.slice(html.indexOf("Others to consider"));
  const honorableMentions = [...othersSection.matchAll(/([^,<]+),\s+[FDG],\s+[A-Z]{2,3}/g)]
    .map((match) => match[1].replace(/<[^>]*>/g, "").trim())
    .slice(0, 34)
    .map((name, index) => ({ name, rank: 251 + index }));
  if (honorableMentions.length !== 34) {
    throw new Error(`Expected 34 NHL.com honorable mentions; parsed ${honorableMentions.length}.`);
  }
  const ranks = [...top250, ...honorableMentions];
  configureConvexTarget(options.target);
  const players = await fetchModel<Player>("Player");
  const byName = new Map<string, Player[]>();
  for (const player of players) {
    if (!player.fullName) continue;
    const key = nameKey(player.fullName);
    byName.set(key, [...(byName.get(key) ?? []), player]);
  }
  const identityPosition: Record<string, string> = {
    [nameKey("Sebastian Aho")]: "C",
    [nameKey("Elias Pettersson")]: "C",
  };
  const resolved = ranks.flatMap(({ name, rank }) => {
    const expected = identityPosition[nameKey(name)];
    const matches = (byName.get(nameKey(name)) ?? []).filter(
      (player) => !expected || player.nhlPos?.includes(expected),
    );
    if (matches.length > 1) throw new Error(`Ambiguous NHL.com identity: ${name}`);
    return matches[0] ? [{ player: matches[0], rank }] : [];
  });
  const updates = resolved.filter(({ player, rank }) => player.nhlRk !== rank);
  console.log(JSON.stringify({ source: SOURCE_URL, target: options.target, top250: top250.length, honorableMentions: honorableMentions.length, matched: resolved.length, updates: updates.length, sample: updates.slice(0, 20).map(({ player, rank }) => ({ fullName: player.fullName, rank })) }, null, 2));
  if (!options.apply) return;
  for (const { player, rank } of updates) {
    await updateById<Player>("Player", player.id, { nhlRk: rank });
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
