import type { InjuryReport } from "../../types/injuries";
import type {
  WeeklyEditionEditorialCandidate,
  WeeklyEditionFactPacket,
} from "../../types/weekly-edition";
import type {
  EditionInjuryContext,
  EditionInjuryObservation,
} from "../../types/weekly-edition-injuries";
import { findPlayerInjury } from "./injuries";

const DAY = 86400000;

function withinWeek(value: string | null, now: number, future = false) {
  const date = value ? Date.parse(value) : NaN;
  const today = Date.parse(new Date(now).toISOString().slice(0, 10));
  return (
    Number.isFinite(date) &&
    (future
      ? date >= today && date <= today + 7 * DAY
      : date <= now && date >= now - 7 * DAY)
  );
}

export function isCurrentInjuryEdition(
  packet: WeeklyEditionFactPacket,
  now: number,
): boolean {
  const asOf = Date.parse(packet.milestone?.triggerDate ?? packet.week.endDate);
  return Number.isFinite(asOf) && now >= asOf && now - asOf <= 7 * DAY;
}

export function enrichEditionWithInjuries(
  packet: WeeklyEditionFactPacket,
  context: EditionInjuryContext,
  report: InjuryReport,
): WeeklyEditionFactPacket {
  if (!isCurrentInjuryEdition(packet, report.fetchedAt)) return packet;
  const previousSnapshot =
    context.previous && context.previous.fetchedAt < report.fetchedAt
      ? context.previous
      : null;
  const previous = previousSnapshot?.observations ?? [];
  const observations: EditionInjuryObservation[] = [];
  const candidates: WeeklyEditionEditorialCandidate[] = [];
  for (const player of context.players) {
    const injury = findPlayerInjury(
      report.injuries,
      player.name,
      player.nhlTeams,
    );
    // Skip ambiguous roster identities instead of attaching one ESPN row twice.
    if (
      injury &&
      context.players.filter((row) =>
        findPlayerInjury([injury], row.name, row.nhlTeams),
      ).length !== 1
    )
      continue;
    const prior = previous.find((row) => row.playerId === player.playerId);
    const playedDate = player.latestPlayedDate;
    const returned =
      !injury &&
      prior &&
      playedDate &&
      playedDate > new Date(prior.observedAt).toISOString().slice(0, 10) &&
      Date.parse(playedDate) <= report.fetchedAt &&
      report.fetchedAt - Date.parse(playedDate) <= 7 * DAY;
    if (injury)
      observations.push({
        ...injury,
        playerId: player.playerId,
        teamId: player.teamId,
        teamName: player.teamName,
        observedAt: report.fetchedAt,
      });
    else if (
      prior &&
      !returned &&
      report.fetchedAt - prior.observedAt <= 30 * DAY
    )
      observations.push(prior);

    const major = injury && ["IR", "LTIR", "O"].includes(injury.designation);
    // A fresh feed or rewritten description does not date the underlying injury.
    // Require a prior baseline before calling an absence newly observed.
    const recentAbsence =
      major &&
      previousSnapshot &&
      report.fetchedAt - previousSnapshot.fetchedAt <= 7 * DAY &&
      withinWeek(injury.updatedAt, report.fetchedAt) &&
      (!prior || !["IR", "LTIR", "O"].includes(prior.designation));
    const nearReturn =
      major && withinWeek(injury.returnDate, report.fetchedAt, true);
    const previouslyNearReturn =
      previousSnapshot &&
      prior &&
      withinWeek(prior.returnDate, previousSnapshot.fetchedAt, true);
    const newReturnOutlook =
      nearReturn &&
      (injury.returnDate !== prior?.returnDate || !previouslyNearReturn);
    if (!recentAbsence && !newReturnOutlook && !returned) continue;
    const rating = player.rating;
    const summary = returned
      ? `${player.name} (${player.teamName}) recorded an NHL appearance on ${playedDate}, after being observed with ${prior.status} on ${new Date(prior.observedAt).toISOString().slice(0, 10)}. ESPN no longer lists this player in the current injury report. This confirms an appearance, not full recovery or restored workload.`
      : `${player.name} (${player.teamName}) is listed by ESPN as ${injury!.status}. ${recentAbsence ? "A major absence is newly observed against the previous roster injury snapshot; this does not establish when the injury happened." : "The estimated return is within the next seven days; this is an outlook, not a confirmed return or a new injury."} Injury/body part: ${injury!.description ?? "not reported"}. Estimated return: ${injury!.returnDate ?? "unknown"}. Update: ${injury!.comment ?? "none supplied"}.`;
    candidates.push({
      id: `injury:${player.playerId}:${returned ? `return:${playedDate}` : `${injury!.id}:${injury!.status}:${injury!.returnDate ?? "unknown"}`}`,
      kind: "injury",
      scope: "week",
      importance: 65,
      occurredAt: returned
        ? playedDate
        : ((recentAbsence ? injury.updatedAt : injury!.returnDate) ??
          undefined),
      playerId: player.playerId,
      playerName: player.name,
      teamId: player.teamId,
      teamName: player.teamName,
      headlineHint: returned
        ? `${player.teamName} gets ${player.name} back in action`
        : recentAbsence
          ? `${player.teamName} adjusts to ${player.name}'s absence`
          : `${player.name}'s possible return could reinforce ${player.teamName}`,
      summary: `${summary} Discuss the potential effect on available talent, positional depth and upcoming matchups using the supplied team context. Do not invent a numerical rating adjustment or guarantee a result.`,
      metrics:
        rating === null
          ? []
          : [
              {
                key: "player_rating",
                label: "Current player rating (not injury-adjusted)",
                value: rating,
              },
            ],
      links: [],
    });
  }
  return {
    ...packet,
    injurySnapshot: {
      fetchedAt: report.fetchedAt,
      sourceUpdatedAt: report.sourceUpdatedAt,
      observations,
    },
    editorialCandidates: [...packet.editorialCandidates, ...candidates],
  };
}
