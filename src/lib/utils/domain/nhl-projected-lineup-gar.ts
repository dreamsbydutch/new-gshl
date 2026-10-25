import type { NhlOrganizations } from "../../types/nhl-organizations";
import type { NhlConditionalTalentArtifact } from "../../types/nhl-conditional-talent";
import type { NhlLineupUsageArtifact } from "../../types/nhl-lineup-usage";
import type { NhlGoalieUsageArtifact } from "../../types/nhl-goalie-usage";
import {
  parseNhlGoalieUsageArtifact,
  predictNhlGoalieUsage,
} from "./nhl-goalie-usage";
import {
  parseConditionalNhlTalentArtifact,
  predictConditionalNhlTalent,
} from "./nhl-conditional-talent";
import {
  parseNhlLineupUsageArtifact,
  predictNhlLineupUsage,
} from "./nhl-lineup-usage";
import { rankConditionalNhlRosterTalent } from "./nhl-conditional-roster-talent";

/** One shared player/team projection. GAR/60 is conditional playing ability;
 * the allocator applies exactly one 82-game workload, with shared ice budgets.
 * This is a healthy-roster scenario, not an availability or injury forecast.
 */
export function buildProjectedNhlLineupGar(
  organizations: NhlOrganizations,
  conditional: NhlConditionalTalentArtifact,
  usage: NhlLineupUsageArtifact,
  targetYear: number,
  mode: "projected" | "standard" = "projected",
  goalieUsage?: NhlGoalieUsageArtifact,
) {
  if (
    !Number.isSafeInteger(targetYear) ||
    targetYear < 1901 ||
    targetYear > 2200 ||
    organizations.seasonId !== (targetYear - 1) * 10000 + targetYear ||
    conditional.cutoffYear !== targetYear - 1 ||
    (mode === "projected" &&
      (usage.cutoffYear !== targetYear - 1 ||
        (goalieUsage && goalieUsage.cutoffYear !== targetYear - 1)))
  )
    throw Error(
      "NHL organization season and projection cutoffs must match the target season",
    );
  parseConditionalNhlTalentArtifact(conditional);
  if (mode === "projected") parseNhlLineupUsageArtifact(usage);
  if (mode === "projected" && goalieUsage)
    parseNhlGoalieUsageArtifact(goalieUsage);
  return rankConditionalNhlRosterTalent(
    organizations.teams.map((team) => ({
      id: `nhl:${team.abbr}`,
      name: team.name,
      abbr: team.abbr,
      selectionPolicy: "nhl-first" as const,
      roster: team.roster.map((player) => {
        const ability = predictConditionalNhlTalent(
          conditional,
          player.nhlPlayerId,
          targetYear,
        );
        const matches = ability.position === player.position;
        const deployment =
          mode === "projected" && player.position !== "G"
            ? predictNhlLineupUsage(usage, player.nhlPlayerId, targetYear)
            : null;
        const roleMatches = deployment?.position === player.position;
        const goalieRole =
          mode === "projected" && player.position === "G" && goalieUsage
            ? predictNhlGoalieUsage(goalieUsage, player.nhlPlayerId, targetYear)
            : null;
        const ratePer60 = matches ? ability.ratePer60 : null;
        return {
          ...player,
          id: `nhl:${player.nhlPlayerId}`,
          ratePer60,
          projectedGoalieRoleWeight: goalieRole?.roleWeight ?? null,
          deploymentReasons:
            player.position === "G"
              ? (goalieRole?.reasons ?? [])
              : (deployment?.reasons ?? []),
          projectedMinutesPerAppearance: roleMatches
            ? deployment.minutesPerAppearance
            : null,
          status:
            ratePer60 === null
              ? ("unavailable" as const)
              : ability.status === "research" ||
                  (mode === "projected" &&
                    (player.position === "G"
                      ? goalieRole?.status !== "supported"
                      : !roleMatches || deployment.status !== "supported"))
                ? ("research" as const)
                : ("qualified" as const),
        };
      }),
    })),
    mode,
  );
}

export interface ProjectedNhlLineupGarPlayer {
  gar: number | null;
  minutesPerTeamGame: number;
  ratePer60: number | null;
  position: string;
  status: "qualified" | "research" | "unavailable";
  roleBasis: "projected" | "standard" | "standard-fallback" | null;
  selected: boolean;
  deploymentReasons: readonly string[];
  teamId: string;
  teamAbbr: string;
}

/** Outside-depth players retain their ability estimate but have no allocated
 * season projection. Null is distinct from an objectively modeled zero.
 */
export function indexProjectedNhlLineupGar(
  teams: ReturnType<typeof rankConditionalNhlRosterTalent>,
) {
  const index = new Map<number, ProjectedNhlLineupGarPlayer>();
  for (const team of teams) {
    for (const player of team.selected) {
      if (player.nhlPlayerId === null) continue;
      if (index.has(player.nhlPlayerId))
        throw Error("Duplicate projected NHL player identity");
      index.set(player.nhlPlayerId, {
        gar: player.gar,
        minutesPerTeamGame: player.minutesPerTeamGame,
        ratePer60: player.ratePer60,
        position: player.position,
        status: player.status,
        roleBasis: player.allocationBasis,
        selected: true,
        deploymentReasons: player.deploymentReasons ?? [],
        teamId: team.id,
        teamAbbr: team.abbr,
      });
    }
    for (const player of team.outsideDepth) {
      if (player.nhlPlayerId === null) continue;
      if (index.has(player.nhlPlayerId))
        throw Error("Duplicate projected NHL player identity");
      index.set(player.nhlPlayerId, {
        gar: null,
        minutesPerTeamGame: 0,
        ratePer60: player.ratePer60,
        position: player.position,
        status: player.status,
        roleBasis: null,
        selected: false,
        deploymentReasons: player.deploymentReasons ?? [],
        teamId: team.id,
        teamAbbr: team.abbr,
      });
    }
  }
  return index;
}
