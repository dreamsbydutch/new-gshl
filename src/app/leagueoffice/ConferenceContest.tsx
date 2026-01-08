import { Button } from "@gshl-components/ui";
import { useSeasonNavigation } from "@gshl-cache";
import { useConferenceContestData } from "@gshl-hooks";
import type { GSHLTeam } from "@gshl-types";
import { useRouter } from "next/navigation";

export function ConferenceContest() {
  const { overall, seasons } = useConferenceContestData();
  const router = useRouter();
  const { setSelectedSeasonId } = useSeasonNavigation();

  const formatTeamLabel = (team?: GSHLTeam) => {
    if (!team) return "—";
    return team.name ?? team.abbr ?? "—";
  };

  const renderTeamLogo = (team: GSHLTeam) => {
    if (!team.logoUrl) {
      return <span>{formatTeamLabel(team)}</span>;
    }

    return (
      <img src={team.logoUrl} alt={formatTeamLabel(team)} className="h-6 w-6" />
    );
  };

  const renderTeamsCell = (cellTeams: GSHLTeam[]) => {
    if (cellTeams.length === 0) return "—";

    const groupedByOwner = cellTeams.reduce(
      (acc, team) => {
        const ownerKey = team.ownerId
          ? String(team.ownerId)
          : `unknown:${team.franchiseId}`;
        const existing = acc.get(ownerKey);

        if (existing) {
          existing.count += 1;
          if (
            team.franchiseId &&
            !existing.teamsByFranchiseId.has(team.franchiseId)
          ) {
            existing.teamsByFranchiseId.set(team.franchiseId, team);
          }
          return acc;
        }

        const teamsByFranchiseId = new Map<string, GSHLTeam>();
        if (team.franchiseId) teamsByFranchiseId.set(team.franchiseId, team);

        acc.set(ownerKey, {
          ownerKey,
          ownerLabel:
            team.ownerNickname ??
            team.ownerLastName ??
            team.ownerFirstName ??
            undefined,
          count: 1,
          teamsByFranchiseId,
        });

        return acc;
      },
      new Map<
        string,
        {
          ownerKey: string;
          ownerLabel?: string;
          count: number;
          teamsByFranchiseId: Map<string, GSHLTeam>;
        }
      >(),
    );

    const items = Array.from(groupedByOwner.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return (a.ownerLabel ?? a.ownerKey).localeCompare(
        b.ownerLabel ?? b.ownerKey,
      );
    });

    return (
      <div className="flex flex-wrap items-center gap-0.5">
        {items.map(({ ownerKey, teamsByFranchiseId, count }) => {
          const uniqueTeams = Array.from(teamsByFranchiseId.values()).sort(
            (a, b) => formatTeamLabel(a).localeCompare(formatTeamLabel(b)),
          );

          return (
            <div
              key={ownerKey}
              className="flex items-center gap-0.5 rounded-md border-2 p-0.5 shadow-lg"
            >
              <div className="flex items-center gap-0.5">
                {uniqueTeams.map((team) => (
                  <span key={team.franchiseId ?? team.id}>
                    {renderTeamLogo(team)}
                  </span>
                ))}
              </div>
              {count > 1 ? (
                <span className="text-xs text-muted-foreground">x{count}</span>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  const renderChampionsCell = (cellTeams: GSHLTeam[]) => {
    if (cellTeams.length === 0) return "—";

    return (
      <div className="flex flex-wrap items-center">
        {cellTeams.map((team, index) => (
          <span
            className="flex items-center gap-0.5 rounded-md border-2 p-0.5 shadow-lg"
            key={`${team.id}:${index}`}
          >
            {renderTeamLogo(team)}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Conference Contest</h1>
      {overall ? (
        <div className="mb-8">
          <h2 className="mb-2 text-xl font-semibold">Overall</h2>
          <div className="overflow-x-auto">
            <table className="w-full table-auto border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-nowrap p-2 text-left font-medium">
                    Stat
                  </th>
                  <th className="text-nowrap p-2 text-left font-medium">
                    {overall.leftConference.name?.replace(" Hotel", "")}
                  </th>
                  <th className="text-nowrap p-2 text-left font-medium">
                    {overall.rightConference.name?.replace(" Hotel", "")}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="text-nowrap p-2">GSHL Champ</td>
                  <td className="p-2">
                    {renderChampionsCell(
                      overall.championTeamsByConferenceId[
                        overall.leftConference.id
                      ] ?? [],
                    )}
                  </td>
                  <td className="p-2">
                    {renderChampionsCell(
                      overall.championTeamsByConferenceId[
                        overall.rightConference.id
                      ] ?? [],
                    )}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="text-nowrap p-2">Finals app.</td>
                  <td className="p-2">
                    <div className="flex flex-col">
                      <div className="mx-auto p-1">
                        {overall.finalsTeamsByConferenceId[
                          overall.rightConference.id
                        ]?.reduce((sum, _team) => sum + 1, 0) ?? 0}{" "}
                        total
                      </div>
                      <div>
                        {renderTeamsCell(
                          overall.finalsTeamsByConferenceId[
                            overall.leftConference.id
                          ] ?? [],
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="flex flex-col">
                      <div className="mx-auto p-1">
                        {overall.finalsTeamsByConferenceId[
                          overall.rightConference.id
                        ]?.reduce((sum, _team) => sum + 1, 0) ?? 0}{" "}
                        total
                      </div>
                      <div>
                        {renderTeamsCell(
                          overall.finalsTeamsByConferenceId[
                            overall.rightConference.id
                          ] ?? [],
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="text-nowrap p-2">Playoff teams</td>
                  <td className="p-2">
                    <div className="flex flex-col">
                      <div className="mx-auto p-1">
                        {overall.playoffTeamsByConferenceId[
                          overall.leftConference.id
                        ]?.reduce((sum, _team) => sum + 1, 0) ?? 0}{" "}
                        total
                      </div>
                      <div>
                        {renderTeamsCell(
                          overall.playoffTeamsByConferenceId[
                            overall.leftConference.id
                          ] ?? [],
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="flex flex-col">
                      <div className="mx-auto p-1">
                        {overall.playoffTeamsByConferenceId[
                          overall.rightConference.id
                        ]?.reduce((sum, _team) => sum + 1, 0) ?? 0}{" "}
                        total
                      </div>
                      <div>
                        {renderTeamsCell(
                          overall.playoffTeamsByConferenceId[
                            overall.rightConference.id
                          ] ?? [],
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="text-nowrap p-2">Playoff wins</td>
                  <td className="p-2">
                    {
                      (
                        overall.playoffRecordByConferenceId[
                          overall.leftConference.id
                        ] ?? { wins: 0, losses: 0 }
                      ).wins
                    }
                  </td>
                  <td className="p-2">
                    {
                      (
                        overall.playoffRecordByConferenceId[
                          overall.rightConference.id
                        ] ?? { wins: 0, losses: 0 }
                      ).wins
                    }
                  </td>
                </tr>
                <tr>
                  <td className="text-nowrap p-2">H2H wins</td>
                  <td className="p-2">
                    {
                      (
                        overall.headToHeadRecordByConferenceId[
                          overall.leftConference.id
                        ] ?? { wins: 0, losses: 0 }
                      ).wins
                    }
                  </td>
                  <td className="p-2">
                    {
                      (
                        overall.headToHeadRecordByConferenceId[
                          overall.rightConference.id
                        ] ?? { wins: 0, losses: 0 }
                      ).wins
                    }
                  </td>
                </tr>
                <tr>
                  <td className="text-nowrap p-2">Season wins</td>
                  <td className="p-2">
                    {
                      (
                        overall.seasonRecordByConferenceId[
                          overall.leftConference.id
                        ] ?? { wins: 0, losses: 0 }
                      ).wins
                    }
                  </td>
                  <td className="p-2">
                    {
                      (
                        overall.seasonRecordByConferenceId[
                          overall.rightConference.id
                        ] ?? { wins: 0, losses: 0 }
                      ).wins
                    }
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {seasons.map((season) => {
        const leftConf = season.leftConference;
        const rightConf = season.rightConference;

        const leftSeasonRecord = season.seasonRecordByConferenceId[
          leftConf.id
        ] ?? { wins: 0, losses: 0 };
        const rightSeasonRecord = season.seasonRecordByConferenceId[
          rightConf.id
        ] ?? { wins: 0, losses: 0 };
        const leftPlayoffRecord = season.playoffRecordByConferenceId[
          leftConf.id
        ] ?? { wins: 0, losses: 0 };
        const rightPlayoffRecord = season.playoffRecordByConferenceId[
          rightConf.id
        ] ?? { wins: 0, losses: 0 };
        const leftH2H = season.headToHeadRecordByConferenceId[leftConf.id] ?? {
          wins: 0,
          losses: 0,
        };
        const rightH2H = season.headToHeadRecordByConferenceId[
          rightConf.id
        ] ?? { wins: 0, losses: 0 };

        return (
          <div key={season.seasonId} className="mt-6">
            <h2 className="mb-2 text-xl font-semibold">{season.seasonName}</h2>
            <div className="overflow-x-auto">
              <table className="w-full table-auto border-collapse text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-nowrap px-3 py-2 text-left font-medium">
                      Stat
                    </th>
                    <th className="text-nowrap px-3 py-2 text-left font-medium">
                      {leftConf.name?.replace(" Hotel", "")}
                    </th>
                    <th className="text-nowrap px-3 py-2 text-left font-medium">
                      {rightConf.name?.replace(" Hotel", "")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="text-nowrap px-3 py-2">GSHL Champ</td>
                    <td className="px-3 py-2">
                      {renderChampionsCell(
                        season.championTeamsByConferenceId[leftConf.id] ?? [],
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {renderChampionsCell(
                        season.championTeamsByConferenceId[rightConf.id] ?? [],
                      )}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="text-nowrap px-3 py-2">Finals app.</td>
                    <td className="px-3 py-2">
                      {renderTeamsCell(
                        season.finalsTeamsByConferenceId[leftConf.id] ?? [],
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {renderTeamsCell(
                        season.finalsTeamsByConferenceId[rightConf.id] ?? [],
                      )}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="text-nowrap px-3 py-2">Playoff teams</td>
                    <td className="px-3 py-2">
                      {renderTeamsCell(
                        season.playoffTeamsByConferenceId[leftConf.id] ?? [],
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {renderTeamsCell(
                        season.playoffTeamsByConferenceId[rightConf.id] ?? [],
                      )}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="text-nowrap px-3 py-2">Playoff wins</td>
                    <td className="px-3 py-2">{leftPlayoffRecord.wins}</td>
                    <td className="px-3 py-2">{rightPlayoffRecord.wins}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="text-nowrap px-3 py-2">H2H wins</td>
                    <td className="px-3 py-2">{leftH2H.wins}</td>
                    <td className="px-3 py-2">{rightH2H.wins}</td>
                  </tr>
                  <tr>
                    <td className="text-nowrap px-3 py-2">Season wins</td>
                    <td className="px-3 py-2">{leftSeasonRecord.wins}</td>
                    <td className="px-3 py-2">{rightSeasonRecord.wins}</td>
                  </tr>
                </tbody>
              </table>
              <div className="mx-auto w-full p-4 text-center">
                <Button
                  className=""
                  onClick={() => {
                    setSelectedSeasonId(String(season.seasonId));
                    router.push("/standings");
                  }}
                >
                  {season.seasonName} Standings
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
