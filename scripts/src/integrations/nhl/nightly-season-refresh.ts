import { capturedCli } from "../data/production-operator-cli";
import { rankRowsWithRankingEngine } from "../../domains/ranking/ranking-engine";
import type { NativeNhlPlayer } from "../../domains/nhl/nightly-season-stats";
import type { DatabaseRecord } from "../data/records";

export type NightlyDbSnapshot = {
  season: Record<string, unknown> & { _id: string };
  players: { _id: string; nhlApiId?: string | null }[];
  stats: (Record<string, unknown> & { _id: string; playerId: string })[];
  teams: { _id: string; abbr: string }[];
  teamStats: (Record<string, unknown> & { _id: string; nhlTeamId: string })[];
};

/** Only the pinned production operator can authenticate; private errors are suppressed. */
export async function createNightlyNhlClient() {
  const deployment = "polished-tern-709";
  const secret = (
    await capturedCli([
      "env",
      "get",
      "CONVEX_SERVER_SECRET",
      "--deployment",
      deployment,
    ])
  ).trim();
  if (!secret || /[\r\n]/.test(secret))
    throw Error("Production NHL credential unavailable");
  const call = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> =>
    JSON.parse(
      await capturedCli([
        "run",
        "--deployment",
        deployment,
        "--codegen",
        "disable",
        "--typecheck",
        "disable",
        name,
        JSON.stringify({ ...args, serverSecret: secret }),
      ]),
    );
  return {
    deployment,
    provisionIdentity: async (args: Record<string, unknown>) =>
      (await call("nightlyNhlStats:provisionIdentity", args)) as {
        action: "existing" | "create" | "link";
        playerId: string | null;
      },
    snapshot: async (seasonId: string) =>
      (await call("nightlyNhlStats:snapshot", {
        seasonId,
      })) as NightlyDbSnapshot,
    refreshBatch: async (args: Record<string, unknown>) =>
      (await call("nightlyNhlStats:refreshBatch", args)) as {
        apply: boolean;
        matched: number;
        changed: number;
        updated: number;
        rows: {
          table: string;
          row: Record<string, unknown> & { _id: string };
        }[];
      },
  };
}

export async function prepareNightlyNhlRefresh(
  snapshot: NightlyDbSnapshot,
  players: NativeNhlPlayer[],
  teams: {
    nhlTeamAbbr: string;
    officialTeamId: number;
    fields: Record<string, number>;
  }[],
) {
  const people = new Map<number, string>();
  for (const player of snapshot.players) {
    if (
      player.nhlApiId === undefined ||
      player.nhlApiId === null ||
      player.nhlApiId === ""
    )
      continue;
    const id = Number(player.nhlApiId);
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    if (people.has(id)) throw Error("Ambiguous canonical NHL player ID");
    people.set(id, player._id);
  }
  const current = new Map<string, NightlyDbSnapshot["stats"][number]>();
  for (const row of snapshot.stats) {
    if (current.has(row.playerId))
      throw Error("Duplicate canonical NHL season stat line");
    current.set(row.playerId, row);
  }
  const ids = new Set<number>();
  const sourceRows = players.map((player) => {
    const playerId = people.get(player.nhlPlayerId);
    if (!playerId)
      throw Error(
        `Canonical NHL player missing: ${player.nhlPlayerId}; resolve identity before refresh`,
      );
    if (ids.has(player.nhlPlayerId))
      throw Error("Duplicate official NHL player");
    ids.add(player.nhlPlayerId);
    return {
      id: current.get(playerId)?._id ?? `nhl:${player.nhlPlayerId}`,
      playerId,
      seasonId: snapshot.season._id,
      ...player.fields,
    };
  });
  // The entire official season population supplies the category-rating cohort, including inserts.
  const rated = await rankRowsWithRankingEngine(
    sourceRows as DatabaseRecord[],
    {
      dataModelName: "PlayerNHL",
      mutate: false,
      dataContext: {
        playerNhlRows: sourceRows as DatabaseRecord[],
        seasonRows: [
          { ...snapshot.season, id: snapshot.season._id } as DatabaseRecord,
        ],
      },
    },
  );
  const byId = new Map(rated.map((r) => [String(r.playerId), r]));
  if (byId.size !== players.length)
    throw Error("NHL category rating population changed");
  const entries = players.map((player) => {
    const playerId = people.get(player.nhlPlayerId)!;
    const seasonRating = byId.get(playerId)?.seasonRating;
    if (typeof seasonRating !== "number" || !Number.isFinite(seasonRating))
      throw Error("NHL category season rating unavailable");
    return {
      nhlPlayerId: player.nhlPlayerId,
      playerId,
      expectedRow: current.get(playerId) ?? null,
      fields: { ...player.fields, seasonRating },
    };
  });
  // A disappearing positive-GP row requires a reviewed correction, never an automatic deletion.
  if ([...current.keys()].some((id) => !byId.has(id)))
    throw Error(
      "Stored NHL player missing from official population; reviewed reconciliation required",
    );
  const clubMap = new Map<string, string>();
  for (const team of snapshot.teams) {
    if (clubMap.has(team.abbr))
      throw Error("Duplicate canonical NHL team abbreviation");
    clubMap.set(team.abbr, team._id);
  }
  const teamRows = teams.map((team) => {
    const nhlTeamId = clubMap.get(team.nhlTeamAbbr);
    if (!nhlTeamId)
      throw Error(`Canonical NHL team missing: ${team.nhlTeamAbbr}`);
    const existing = snapshot.teamStats.filter(
      (r) => r.nhlTeamId === nhlTeamId,
    );
    if (existing.length > 1) throw Error("Duplicate NHL team season row");
    return {
      nhlTeamId,
      abbr: team.nhlTeamAbbr,
      expectedRow: existing[0] ?? null,
      fields: team.fields,
    };
  });
  return { players: entries, teams: teamRows };
}

export function verifyNightlyNhlRefresh(
  after: NightlyDbSnapshot,
  plan: Awaited<ReturnType<typeof prepareNightlyNhlRefresh>>,
  sourceSha256: string,
  sourceFetchedAt: number,
) {
  if (after.stats.length !== plan.players.length)
    throw Error("Nightly NHL population verification failed");
  for (const entry of plan.players) {
    const rows = after.stats.filter((r) => r.playerId === entry.playerId);
    if (
      rows.length !== 1 ||
      Object.entries(entry.fields).some(
        ([key, value]) =>
          JSON.stringify(rows[0][key]) !== JSON.stringify(value),
      ) ||
      rows[0].nhlStatsSourceSha256 !== sourceSha256 ||
      rows[0].nhlStatsSourceFetchedAt !== sourceFetchedAt
    )
      throw Error("Nightly NHL player verification failed");
  }
  for (const entry of plan.teams) {
    const rows = after.teamStats.filter((r) => r.nhlTeamId === entry.nhlTeamId);
    if (
      rows.length !== 1 ||
      Object.entries(entry.fields).some(
        ([key, value]) => rows[0][key] !== value,
      ) ||
      rows[0].sourceSha256 !== sourceSha256 ||
      rows[0].sourceFetchedAt !== sourceFetchedAt
    )
      throw Error("Nightly NHL team verification failed");
  }
}
