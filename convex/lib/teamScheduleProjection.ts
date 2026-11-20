import { projectScheduleMatchup } from "./publicProjection";

type TeamScheduleWeekSource = {
  id: string;
  weekNum: string | number;
  endDate: string | null;
};

type TeamSource = {
  [key: string]: unknown;
  _id: string;
};

type FranchiseSource = {
  [key: string]: unknown;
  name: string;
  logoUrl?: string | null;
};

type ConferenceSource = {
  [key: string]: unknown;
  abbr: string;
};

/** Builds sorted schedule rows with only the week fields rendered by the UI. */
export function projectTeamScheduleRows(
  matchups: readonly Parameters<typeof projectScheduleMatchup>[0][],
  weeks: readonly TeamScheduleWeekSource[],
) {
  const weeksById = new Map(weeks.map((week) => [week.id, week] as const));

  return matchups
    .map((matchup) => {
      const week = weeksById.get(matchup.weekId);
      return {
        matchup: projectScheduleMatchup(matchup),
        week: week ? { weekNum: week.weekNum, endDate: week.endDate } : null,
      };
    })
    .sort((left, right) => {
      const leftWeek = Number(left.week?.weekNum ?? 0);
      const rightWeek = Number(right.week?.weekNum ?? 0);
      return leftWeek - rightWeek;
    });
}

/** Projects the team branding used by schedule rows and lazy stat details. */
export function projectTeamScheduleTeam(
  team: TeamSource,
  franchise: FranchiseSource | null,
  conference: ConferenceSource | null,
) {
  return {
    id: team._id,
    name: franchise?.name ?? null,
    logoUrl: franchise?.logoUrl ?? null,
    confAbbr: conference?.abbr ?? null,
  };
}
