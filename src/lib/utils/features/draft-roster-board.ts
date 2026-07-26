import type { DraftRosterConferenceView, GSHLTeam } from "@gshl-types";

export function groupDraftRosterTeamsByConference(
  teams: readonly GSHLTeam[],
): DraftRosterConferenceView[] {
  const conferences = new Map<string, DraftRosterConferenceView>();

  for (const team of teams) {
    const conferenceId = String(
      team.confId ?? team.confAbbr ?? team.confName ?? "unassigned",
    );
    const existing = conferences.get(conferenceId);
    if (existing) {
      existing.teams.push(team);
      continue;
    }

    conferences.set(conferenceId, {
      id: conferenceId,
      name: team.confName ?? team.confAbbr ?? "Conference",
      abbr: team.confAbbr,
      logoUrl: team.confLogoUrl,
      teams: [team],
    });
  }

  return [...conferences.values()]
    .map((conference) => ({
      ...conference,
      teams: [...conference.teams].sort((left, right) =>
        String(left.name ?? left.abbr ?? "").localeCompare(
          String(right.name ?? right.abbr ?? ""),
        ),
      ),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
