import type { Conference, Franchise, GSHLTeam, Owner, Team } from "@gshl-types";

export type TeamRelations = {
  franchises?: Franchise[];
  conferences?: Conference[];
  owners?: Owner[];
};

const defaultTeam: GSHLTeam = {
  id: "0",
  seasonId: "0",
  franchiseId: "0",
  name: null,
  abbr: null,
  logoUrl: null,
  isActive: false,
  confName: null,
  confAbbr: null,
  confLogoUrl: null,
  ownerId: null,
  ownerFirstName: null,
  ownerLastName: null,
  ownerNickname: null,
  ownerEmail: null,
  ownerOwing: null,
  ownerIsActive: false,
};

const isGshlTeam = (team: Team | GSHLTeam): team is GSHLTeam =>
  "ownerFirstName" in team;

export function enrichTeam(
  team: Team | GSHLTeam | null | undefined,
  relations: TeamRelations,
): GSHLTeam {
  if (!team) return defaultTeam;
  if (isGshlTeam(team)) return team;

  const { franchises = [], conferences = [], owners = [] } = relations;
  const franchise = franchises.find((f) => f.id === team.franchiseId);
  const conference = conferences.find((c) => c.id === team.confId);
  const owner = owners.find((o) => o.id === franchise?.ownerId);

  return {
    id: team.id,
    seasonId: team.seasonId,
    franchiseId: team.franchiseId,
    name: franchise?.name ?? null,
    abbr: franchise?.abbr ?? null,
    logoUrl: franchise?.logoUrl ?? null,
    isActive: franchise?.isActive ?? false,
    confName: conference?.name ?? null,
    confAbbr: conference?.abbr ?? null,
    confLogoUrl: conference?.logoUrl ?? null,
    ownerId: owner?.id ?? null,
    ownerFirstName: owner?.firstName ?? null,
    ownerLastName: owner?.lastName ?? null,
    ownerNickname: owner?.nickName ?? null,
    ownerEmail: owner?.email ?? null,
    ownerOwing: owner?.owing ?? null,
    ownerIsActive: owner?.isActive ?? false,
  };
}

export function enrichTeams(
  teams: Array<Team | GSHLTeam> | null | undefined,
  relations: TeamRelations,
): GSHLTeam[] {
  if (!teams?.length) return [];
  return teams.map((team) => enrichTeam(team, relations));
}
