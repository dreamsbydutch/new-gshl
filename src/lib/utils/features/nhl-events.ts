import { z } from "zod";
import type { NHLMatchupPlayerRow } from "@gshl-lib/types/nhl";

const name = z.object({ default: z.string() });
const team = z.object({ id: z.number(), abbrev: z.string() });
export const nhlEventFeedSchema = z.object({
  id: z.number(),
  awayTeam: team,
  homeTeam: team,
  rosterSpots: z
    .array(
      z.object({
        playerId: z.number(),
        firstName: name,
        lastName: name,
      }),
    )
    .default([]),
  plays: z
    .array(
      z.object({
        eventId: z.number(),
        typeDescKey: z.string(),
        periodDescriptor: z.object({
          number: z.number(),
          periodType: z.string(),
        }),
        timeInPeriod: z.string(),
        sortOrder: z.number().optional(),
        details: z
          .object({
            eventOwnerTeamId: z.number().optional(),
            scoringPlayerId: z.number().optional(),
            assist1PlayerId: z.number().optional(),
            assist2PlayerId: z.number().optional(),
            goalieInNetId: z.number().optional(),
            committedByPlayerId: z.number().optional(),
            drawnByPlayerId: z.number().optional(),
            servedByPlayerId: z.number().optional(),
            descKey: z.string().optional(),
            duration: z.number().optional(),
            awayScore: z.number().optional(),
            homeScore: z.number().optional(),
          })
          .optional(),
      }),
    )
    .transform((plays) =>
      plays.filter((play) => ["goal", "penalty"].includes(play.typeDescKey)),
    ),
});

export function buildNHLGameEvents(
  feed: z.infer<typeof nhlEventFeedSchema> | null | undefined,
  roster: ReadonlyArray<
    Pick<NHLMatchupPlayerRow, "nhlPlayerId" | "fullName" | "stats">
  >,
) {
  if (!feed) return [];
  const names = new Map(
    feed.rosterSpots.map((player) => [
      player.playerId,
      `${player.firstName.default} ${player.lastName.default}`.trim(),
    ]),
  );
  const gshlPlayers = new Map(
    roster.flatMap((player) => {
      const id = player.nhlPlayerId ?? player.stats?.playerId;
      return id ? [[id, player.fullName] as const] : [];
    }),
  );
  return [...feed.plays]
    .sort(
      (a, b) =>
        a.periodDescriptor.number - b.periodDescriptor.number ||
        a.timeInPeriod.localeCompare(b.timeInPeriod) ||
        (a.sortOrder ?? a.eventId) - (b.sortOrder ?? b.eventId),
    )
    .map((play) => {
      const details = play.details ?? {};
      const goal = play.typeDescKey === "goal";
      const participants: { role: string; name: string; isGshl: boolean }[] =
        [];
      const add = (role: string, id?: number) => {
        if (id === undefined) return;
        participants.push({
          role,
          name: names.get(id) ?? gshlPlayers.get(id) ?? `Player #${id}`,
          isGshl: gshlPlayers.has(id),
        });
      };
      if (goal) {
        add("Scorer", details.scoringPlayerId);
        add("Assist", details.assist1PlayerId);
        add("Assist", details.assist2PlayerId);
        add("Against", details.goalieInNetId);
      } else {
        add("By", details.committedByPlayerId);
        add("Drawn by", details.drawnByPlayerId);
        add("Served by", details.servedByPlayerId);
      }
      const period = play.periodDescriptor;
      return {
        id: play.eventId,
        period:
          period.periodType === "REG"
            ? `P${period.number}`
            : period.periodType === "OT"
              ? `${period.number > 4 ? period.number - 3 : ""}OT`
              : period.periodType,
        time: play.timeInPeriod,
        team: [feed.awayTeam, feed.homeTeam].find(
          (item) => item.id === details.eventOwnerTeamId,
        )?.abbrev,
        title: goal
          ? period.periodType === "SO"
            ? "Shootout goal"
            : "Goal"
          : "Penalty",
        description: goal
          ? details.assist1PlayerId === undefined &&
            details.assist2PlayerId === undefined
            ? "Unassisted"
            : ""
          : [
              details.descKey?.replaceAll("-", " "),
              details.duration !== undefined ? `${details.duration} min` : null,
            ]
              .filter(Boolean)
              .join(" · "),
        score:
          goal &&
          details.awayScore !== undefined &&
          details.homeScore !== undefined
            ? `${feed.awayTeam.abbrev} ${details.awayScore} – ${details.homeScore} ${feed.homeTeam.abbrev}`
            : null,
        participants,
      };
    });
}
