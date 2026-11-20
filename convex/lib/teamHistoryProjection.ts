export { projectScheduleMatchup as projectTeamHistoryMatchup } from "./publicProjection";

type TeamHistoryTeamSource = {
  [key: string]: unknown;
  _id: string;
};

type TeamHistoryFranchiseSource = {
  [key: string]: unknown;
  ownerId: string;
  name: string;
  logoUrl?: string | null;
};

type TeamHistoryConferenceSource = {
  [key: string]: unknown;
  abbr: string;
};

type TeamHistoryOwnerSource = {
  [key: string]: unknown;
  _id: string;
  firstName: string;
  lastName: string;
};

type TeamHistoryWeekSource = {
  [key: string]: unknown;
  _id: string;
  weekNum: string | number;
};

type TeamHistorySeasonSource = {
  [key: string]: unknown;
  _id: string;
  year: string;
  name: string;
  categories: string[];
};

/** Projects only the public team identity used by history filters and rows. */
export function projectTeamHistoryTeam(
  team: TeamHistoryTeamSource,
  franchise: TeamHistoryFranchiseSource | null,
  conference: TeamHistoryConferenceSource | null,
  owner: TeamHistoryOwnerSource | null,
) {
  return {
    id: team._id,
    name: franchise?.name ?? null,
    logoUrl: franchise?.logoUrl ?? null,
    confAbbr: conference?.abbr ?? null,
    ownerId: owner?._id ?? franchise?.ownerId ?? null,
    ownerFirstName: owner?.firstName ?? null,
    ownerLastName: owner?.lastName ?? null,
  };
}

/** Projects the week fields used for ordering, labels, and completion state. */
export function projectTeamHistoryWeek(
  week: TeamHistoryWeekSource,
  endDate: string | null,
) {
  return {
    id: week._id,
    weekNum: week.weekNum,
    endDate,
  };
}

/** Projects the season fields used by filters, ordering, dividers, and stats. */
export function projectTeamHistorySeason(season: TeamHistorySeasonSource) {
  return {
    id: season._id,
    year: season.year,
    name: season.name,
    categories: season.categories,
  };
}
