import type { NhlConditionalRosterTalentTeam } from "../../types/nhl-roster-talent";
import { rankNhlRosterTalent } from "./nhl-roster-talent";

/** Explicit comparison policy, not a forecast of a coach's lineup decisions.
 * Reserve slots get a small rotation share. One team has one shared ice budget.
 */
export const NHL_TALENT_LINEUP_USAGE = {
  F: {
    minutes: 180,
    weights: [20, 20, 20, 17, 17, 17, 14, 14, 14, 9, 9, 9, 2, 2],
  },
  D: { minutes: 120, weights: [24, 24, 20, 20, 16, 16, 2, 2] },
  G: { minutes: 60, weights: [0.65, 0.35] },
} as const;

/** Input ratePer60 is conditional ability. Output gar is allocated GAR per82 regulation games.
 * Projected roles are normalized budget weights, not literal future player minutes.
 * Unknown roles retain their standard slot shares and prevent a complete team rank.
 */
export function rankConditionalNhlRosterTalent(
  teams: readonly NhlConditionalRosterTalentTeam[],
  mode: "standard" | "projected" = "standard",
) {
  if (mode !== "standard" && mode !== "projected")
    throw Error("Invalid NHL lineup allocation mode");
  const usageByPlayer = new Map<string, number | null | undefined>();
  const goalieRoleByPlayer = new Map<string, number | null | undefined>();
  const nhlFirstByTeam = new Map(
    teams.map((team) => [team.id, team.selectionPolicy === "nhl-first"]),
  );
  for (const team of teams)
    for (const player of team.roster) {
      const minutes = player.projectedMinutesPerAppearance;
      if (
        minutes != null &&
        (typeof minutes !== "number" ||
          !Number.isFinite(minutes) ||
          minutes <= 0 ||
          minutes > 65)
      )
        throw Error("Invalid projected NHL minutes per appearance");
      usageByPlayer.set(player.id, minutes);
      const goalieRole = player.projectedGoalieRoleWeight;
      if (
        goalieRole != null &&
        (!Number.isFinite(goalieRole) || goalieRole <= 0)
      )
        throw Error("Invalid projected goalie role weight");
      goalieRoleByPlayer.set(player.id, goalieRole);
    }
  const rated = rankNhlRosterTalent(
    teams.map((team) => ({
      ...team,
      roster: team.roster.map(({ ratePer60, ...player }) => ({
        ...player,
        gar: ratePer60,
      })),
    })),
  )
    .map((team) => {
      const missingUsage = team.selected.filter((player) =>
        player.position === "G"
          ? goalieRoleByPlayer.get(player.id) == null
          : usageByPlayer.get(player.id) == null,
      );
      const missingSlots = team.groups.filter(
        (group) => group.roster.length !== group.required,
      );
      const usageIssues =
        mode === "standard"
          ? []
          : [
              ...missingUsage.map(
                (player) =>
                  `Projected usage is unavailable for ${player.playerName}.`,
              ),
              ...missingSlots.map(
                (group) =>
                  `Projected allocation requires all ${group.required} ${group.position === "F" ? "forward" : group.position === "D" ? "defense" : "goalie"} roster slots.`,
              ),
            ];
      const groups = team.groups.map((group) => {
        const usageComplete =
          mode === "standard" ||
          (group.roster.length === group.required &&
            group.roster.every((player) =>
              group.position === "G"
                ? goalieRoleByPlayer.get(player.id) != null
                : usageByPlayer.get(player.id) != null,
            ));
        const knownUsage = group.roster.filter(
          (player) => usageByPlayer.get(player.id) != null,
        );
        const allocationBasis:
          | "standard"
          | "projected"
          | "partial-projected"
          | "standard-fallback" =
          mode === "standard"
            ? "standard"
            : usageComplete
              ? "projected"
              : knownUsage.length > 0
                ? "partial-projected"
                : "standard-fallback";
        const policy = NHL_TALENT_LINEUP_USAGE[group.position];
        const denominator = policy.weights.reduce(
          (s: number, w: number) => s + w,
          0,
        );
        const projectedMinutes = new Map<string, number>();
        if (mode === "projected" && group.position === "G" && usageComplete) {
          const mass = group.roster.reduce(
            (sum, player) => sum + goalieRoleByPlayer.get(player.id)!,
            0,
          );
          for (const player of group.roster)
            projectedMinutes.set(
              player.id,
              (60 * goalieRoleByPlayer.get(player.id)!) / mass,
            );
        }
        const standardShare = (index: number) =>
          (policy.minutes * policy.weights[index]!) / denominator;
        const unallocatedMinutesPerTeamGame = policy.weights
          .slice(group.roster.length)
          .reduce(
            (sum: number, _weight: number, index: number) =>
              sum + standardShare(group.roster.length + index),
            0,
          );
        if (
          (allocationBasis === "projected" ||
            allocationBasis === "partial-projected") &&
          group.position !== "G"
        ) {
          const primaryCount = group.position === "F" ? 12 : 6;
          const heldIndices = policy.weights.flatMap((_weight, index) =>
            !group.roster[index] ||
            usageByPlayer.get(group.roster[index].id) == null
              ? [index]
              : [],
          );
          const heldPrimary = heldIndices.filter(
            (index) => index < primaryCount,
          );
          const availableReserveIndices = policy.weights.flatMap(
            (_weight, index) =>
              index >= primaryCount && !heldIndices.includes(index)
                ? [index]
                : [],
          );
          const byUsage = [...knownUsage].sort(
            (a, b) =>
              (nhlFirstByTeam.get(team.id)
                ? Number(b.membership === "nhl-roster") -
                  Number(a.membership === "nhl-roster")
                : 0) ||
              usageByPlayer.get(b.id)! - usageByPlayer.get(a.id)! ||
              (a.nhlPlayerId ?? Infinity) - (b.nhlPlayerId ?? Infinity) ||
              a.id.localeCompare(b.id),
          );
          const availablePrimaryCount = primaryCount - heldPrimary.length;
          const reserves = byUsage.slice(availablePrimaryCount);
          const reserveMinutes = availableReserveIndices.map(standardShare);
          const remaining =
            policy.minutes -
            policy.weights
              .slice(primaryCount)
              .reduce(
                (sum: number, _weight: number, index: number) =>
                  sum + standardShare(primaryCount + index),
                0,
              ) -
            heldPrimary.reduce((sum, index) => sum + standardShare(index), 0);
          const primary = byUsage.slice(0, availablePrimaryCount);
          const mass = primary.reduce(
            (sum, player) => sum + usageByPlayer.get(player.id)!,
            0,
          );
          for (const player of primary)
            projectedMinutes.set(
              player.id,
              remaining * (usageByPlayer.get(player.id)! / mass),
            );
          reserves.forEach((player, index) =>
            projectedMinutes.set(player.id, reserveMinutes[index]!),
          );
        }
        const roster = group.roster.map((player, index) => {
          const ratePer60 = player.gar;
          // Missing slots keep their own missing share; never redistribute it to known players.
          const minutesPerTeamGame =
            projectedMinutes.get(player.id) ??
            (policy.minutes * policy.weights[index]!) / denominator;
          if (
            !Number.isFinite(minutesPerTeamGame) ||
            minutesPerTeamGame <= 0 ||
            minutesPerTeamGame > 60
          )
            throw Error("Invalid NHL regulation-minute allocation");
          return {
            ...player,
            ratePer60,
            projectedMinutesPerAppearance: usageByPlayer.get(player.id),
            allocationBasis:
              mode === "standard"
                ? ("standard" as const)
                : projectedMinutes.has(player.id)
                  ? ("projected" as const)
                  : ("standard-fallback" as const),
            minutesPerTeamGame,
            gar:
              ratePer60 === null
                ? null
                : (ratePer60 * minutesPerTeamGame * 82) / 60,
          };
        });
        return {
          ...group,
          roster,
          allocationBasis,
          usageComplete,
          unallocatedMinutesPerTeamGame,
          total: roster.reduce((s, p) => s + (p.gar ?? 0), 0),
        };
      });
      const usageComplete = groups.every((group) => group.usageComplete);
      const projectedGroups = groups.filter(
        (group) =>
          group.allocationBasis === "projected" ||
          group.allocationBasis === "partial-projected",
      ).length;
      const allocationBasis:
        | "standard"
        | "projected"
        | "partial-projected"
        | "standard-fallback" =
        mode === "standard"
          ? "standard"
          : usageComplete
            ? "projected"
            : projectedGroups > 0
              ? "partial-projected"
              : "standard-fallback";
      const selected = groups.flatMap((g) => g.roster);
      const knownSubtotal = groups.reduce((s, g) => s + g.total, 0);
      return {
        ...team,
        groups,
        selected,
        allocationBasis,
        usageComplete,
        usageIssues,
        complete: team.complete && usageComplete,
        provisional: team.provisional || !usageComplete,
        knownSubtotal,
        modeledGar: selected.some((p) => p.gar !== null) ? knownSubtotal : null,
        gar: team.complete && usageComplete ? knownSubtotal : null,
        researchPlayers: selected.filter((p) => p.status === "research"),
        outsideDepth: team.outsideDepth.map((player) => ({
          ...player,
          ratePer60: player.gar,
          gar: 0,
          minutesPerTeamGame: 0,
        })),
      };
    })
    .sort(
      (a, b) =>
        Number(b.complete) - Number(a.complete) ||
        (a.complete && b.complete ? b.gar! - a.gar! : 0) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );
  let previous: number | null = null,
    rank = 0;
  return rated.map((team, index) => {
    if (team.complete && team.gar !== previous) rank = index + 1;
    previous = team.gar;
    return { ...team, rank: team.complete ? rank : null };
  });
}
