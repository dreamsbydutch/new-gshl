import type { MutationCtx } from "../_generated/server";
import type { WeeklyEditionFactPacket } from "../../src/lib/types/weekly-edition";
import type { EditionInjuryContext } from "../../src/lib/types/weekly-edition-injuries";
import {
  isCurrentInjuryEdition,
  enrichEditionWithInjuries,
} from "../../src/lib/utils/features/weekly-edition-injuries";
import { parseEspnInjuries } from "../../src/lib/utils/features/injuries";
import { utcTimestampToDateKey } from "./timestamps";

export async function prepareEditionInjuryContext(
  ctx: MutationCtx,
  packet: WeeklyEditionFactPacket,
  excludedEditionId?: string,
): Promise<EditionInjuryContext | null> {
  const now = Date.now();
  if (!isCurrentInjuryEdition(packet, now)) return null;
  const owners = packet.research?.owners ?? [];
  if (!owners.length) return null;
  const seasonId = ctx.db.normalizeId(
    "seasons",
    packet.milestone?.analysisSeasonId ?? packet.season.id,
  );
  if (!seasonId) return null;
  const previousEditions = await ctx.db
    .query("weeklyEditions")
    .withIndex("by_status_publishedAt", (q) => q.eq("status", "published"))
    .order("desc")
    .take(20);
  const previous =
    previousEditions
      .filter((row) => String(row._id) !== excludedEditionId)
      .map((row) => (row.facts as WeeklyEditionFactPacket).injurySnapshot)
      .filter((snapshot) => snapshot && snapshot.fetchedAt < now)
      .sort((a, b) => b!.fetchedAt - a!.fetchedAt)[0] ?? null;
  const previousIds = new Set(
    previous?.observations.map((row) => row.playerId),
  );
  const startDate = utcTimestampToDateKey(now - 30 * 86400000)!;
  const endDate = utcTimestampToDateKey(now)!;
  const players = (
    await Promise.all(
      owners.map(async (owner) => {
        const ownerId = ctx.db.normalizeId("owners", owner.ownerId);
        if (!ownerId) return [];
        const roster = await ctx.db
          .query("players")
          .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
          .take(60);
        return Promise.all(
          roster.map(async (player) => {
            const days = previousIds.has(String(player._id))
              ? await ctx.db
                  .query("playerDayStatLines")
                  .withIndex("by_seasonId_playerId_date", (q) =>
                    q
                      .eq("seasonId", seasonId)
                      .eq("playerId", player._id)
                      .gte("date", startDate)
                      .lte("date", endDate),
                  )
                  .order("desc")
                  .take(62)
              : [];
            const played = days.find((day) => Number(day.GP) > 0);
            const rating = Number(player.overallRating);
            return {
              playerId: String(player._id),
              name: player.fullName,
              nhlTeams: player.nhlTeam ?? [],
              teamId: owner.teamId,
              teamName: owner.teamName,
              rating:
                player.overallRating != null && Number.isFinite(rating)
                  ? rating
                  : null,
              latestPlayedDate: played?.date ?? null,
            };
          }),
        );
      }),
    )
  ).flat();
  return { players, previous };
}

export async function addEditionInjuryReporting(
  packet: WeeklyEditionFactPacket,
  context: EditionInjuryContext | null,
): Promise<WeeklyEditionFactPacket> {
  if (!context) return packet;
  try {
    const response = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries",
      { signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok) throw new Error("Injury feed unavailable");
    const payload: unknown = await response.json();
    const report = parseEspnInjuries(payload);
    const sourceAge = report.fetchedAt - Date.parse(report.sourceUpdatedAt);
    if (sourceAge > 86400000 || sourceAge < -300000)
      throw new Error("Injury feed timestamp is not current");
    return enrichEditionWithInjuries(packet, context, report);
  } catch {
    // An unavailable feed is not evidence of recovery; retain the last observation.
    return {
      ...packet,
      ...(context.previous ? { injurySnapshot: context.previous } : {}),
      ...(packet.research
        ? {
            research: {
              ...packet.research,
              limitations: [
                ...packet.research.limitations,
                "Current injury reporting is unavailable. Do not infer injuries or recoveries.",
              ],
            },
          }
        : {}),
    };
  }
}
