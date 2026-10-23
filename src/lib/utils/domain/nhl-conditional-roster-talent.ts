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

/** Input ratePer60 is conditional ability. Output gar is allocated GAR per 82 regulation games. */
export function rankConditionalNhlRosterTalent(
  teams: readonly NhlConditionalRosterTalentTeam[],
) {
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
      const groups = team.groups.map((group) => {
        const policy = NHL_TALENT_LINEUP_USAGE[group.position];
        const denominator = policy.weights.reduce(
          (s: number, w: number) => s + w,
          0,
        );
        const roster = group.roster.map((player, index) => {
          const ratePer60 = player.gar!;
          // Missing slots keep their own missing share; never redistribute it to known players.
          const minutesPerTeamGame =
            (policy.minutes * policy.weights[index]!) / denominator;
          return {
            ...player,
            ratePer60,
            minutesPerTeamGame,
            gar: (ratePer60 * minutesPerTeamGame * 82) / 60,
          };
        });
        return {
          ...group,
          roster,
          total: roster.reduce((s, p) => s + p.gar, 0),
        };
      });
      const selected = groups.flatMap((g) => g.roster);
      const knownSubtotal = groups.reduce((s, g) => s + g.total, 0);
      return {
        ...team,
        groups,
        selected,
        knownSubtotal,
        modeledGar: selected.length ? knownSubtotal : null,
        gar: team.complete ? knownSubtotal : null,
        researchPlayers: selected.filter((p) => p.status === "research"),
        outsideDepth: team.outsideDepth.map((player) => ({
          ...player,
          ratePer60: player.gar!,
          gar: 0,
          minutesPerTeamGame: 0,
        })),
      };
    })
    .sort(
      (a, b) =>
        (b.modeledGar ?? -Infinity) - (a.modeledGar ?? -Infinity) ||
        a.name.localeCompare(b.name),
    );
  let previous: number | null = null,
    rank = 0;
  return rated.map((team, index) => {
    if (team.modeledGar !== null && team.modeledGar !== previous)
      rank = index + 1;
    previous = team.modeledGar;
    return { ...team, rank: team.modeledGar === null ? null : rank };
  });
}
