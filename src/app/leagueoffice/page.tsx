"use client";

import {
  useAllTeamDays,
  useAllTeams,
  useAllTeamWeeks,
  useAllWeeks,
} from "@gshl-hooks";

export default function LeagueOfficePage() {
  const { data } = useAllTeamWeeks();
  const { data: weeks } = useAllWeeks();
  const { data: teams } = useAllTeams();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-6 text-3xl font-bold">Team Daily Performance</h1>

        <div className="overflow-x-auto rounded-lg border shadow">
          <table className="min-w-full bg-white">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Team
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Rating
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {data
                .sort((a, b) => b.Rating - a.Rating)
                .slice(-50)
                .map((day, index) => {
                  const team = teams.find((t) => t.id === day.gshlTeamId);
                  const week = weeks?.find((w) => w.id === day.weekId);
                  return (
                    <tr
                      key={day.id}
                      className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}
                    >
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                        <div className="flex items-center">
                          {team?.logoUrl && (
                            <img
                              src={team.logoUrl}
                              alt={`${team.name} logo`}
                              className="mr-3 h-8 w-8 rounded-full"
                            />
                          )}
                          <div>
                            <div className="font-medium">{team?.name}</div>
                            <div className="text-xs text-gray-500">
                              {team?.abbr}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                        {(week?.seasonId ?? 0) + 2014} - Week {week?.weekNum}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-gray-900">
                        {day.Rating.toFixed(2)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-gray-900">
                        {day.GP}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {data.length === 0 && (
          <div className="mt-8 text-center">
            <p className="text-gray-500">No team daily data available.</p>
          </div>
        )}
      </div>
    </div>
  );
}
