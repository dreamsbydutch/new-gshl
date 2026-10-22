import { Fragment } from "react";
import type { useNormalizedNhlRosters } from "../../hooks/features/useNormalizedNhlRosters";

const gar = (value: number | null) =>
  value === null ? "\u2014" : `${value > 0 ? "+" : ""}${value.toFixed(2)}`;

export function NhlRosterTalentRankings({
  teams,
  basis,
}: {
  teams: ReturnType<typeof useNormalizedNhlRosters>["talentTeams"];
  basis: "projected" | "historical";
}) {
  return (
    <section className="space-y-3" aria-labelledby="nhl-team-talent-heading">
      <h3 id="nhl-team-talent-heading" className="text-lg font-semibold">
        {basis === "historical"
          ? "Historical NHL season contribution"
          : "Projected NHL roster talent"}
      </h3>
      <p className="text-sm text-muted-foreground">
        {basis === "historical"
          ? "Top recorded season GAR from up to 14 forwards, 8 defensemen and 2 goalies. Uses actual season contribution, without forecasts or an 82-game extrapolation. Traded players await verified club allocations."
          : "Up to 14 forwards, 8 defensemen and 2 goalies by projected GAR per 82 team games. These annual projections already include expected workload and participation risk. This compares roster talent; it does not predict standings."}
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[650px] text-sm tabular-nums">
          <caption className="sr-only">
            NHL team roster talent, highest{" "}
            {basis === "historical" ? "recorded season" : "projected"} GAR first
          </caption>
          <thead className="bg-gray-100 text-left">
            <tr>
              <th scope="col" className="p-3">
                Rank
              </th>
              <th scope="col" className="p-3">
                Team
              </th>
              <th scope="col" className="p-3 text-right">
                Forwards
              </th>
              <th scope="col" className="p-3 text-right">
                Defense
              </th>
              <th scope="col" className="p-3 text-right">
                Goalies
              </th>
              <th scope="col" className="p-3 text-right" aria-sort="descending">
                {basis === "historical" ? "Season GAR" : "Projected GAR/82"}
              </th>
              <th scope="col" className="p-3 text-right">
                Rated F / D / G
              </th>
              <th scope="col" className="p-3 text-right">
                Unrated
              </th>
              <th scope="col" className="p-3">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <Fragment key={team.id}>
                <tr className="border-t">
                  <td className="p-3">{team.rank ?? "\u2014"}</td>
                  <th scope="row" className="p-3 text-left font-medium">
                    {team.name}
                  </th>
                  {team.groups.map((group) => (
                    <td key={group.position} className="p-3 text-right">
                      {gar(group.roster.length ? group.total : null)}
                    </td>
                  ))}
                  <td className="p-3 text-right font-semibold">
                    {gar(team.modeledGar)}
                  </td>
                  <td className="whitespace-nowrap p-3 text-right">
                    {team.groups
                      .map((group) => group.roster.length)
                      .join(" / ")}
                  </td>
                  <td className="p-3 text-right">
                    {team.unmodeled.length + team.unallocated.length}
                  </td>
                  <td className="whitespace-nowrap p-3">
                    {!team.complete
                      ? "Partial roster"
                      : team.provisional
                        ? "Provisional"
                        : "Full roster"}
                  </td>
                </tr>
                <tr>
                  <td colSpan={9} className="px-3 pb-3">
                    <details>
                      <summary className="cursor-pointer text-blue-700 underline">
                        View rated roster
                      </summary>
                      <div className="mt-3 grid gap-5 sm:grid-cols-3">
                        {team.groups.map((group) => (
                          <div key={group.position}>
                            <h4 className="mb-2 font-semibold">
                              {group.position === "F"
                                ? "Forwards"
                                : group.position === "D"
                                  ? "Defensemen"
                                  : "Goalies"}
                            </h4>
                            <ol className="space-y-1">
                              {group.roster.map((player, i) => (
                                <li
                                  key={player.id}
                                  className="flex justify-between gap-3"
                                >
                                  <span>
                                    {i + 1}. {player.playerName}
                                  </span>
                                  <span>{gar(player.gar)}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        ))}
                      </div>
                      {!team.complete ? (
                        <p className="mt-3">
                          Known contribution: {gar(team.knownSubtotal)} GAR.
                          Missing position slots are not filled with zero.
                        </p>
                      ) : null}
                      {team.researchPlayers.length ? (
                        <p className="mt-3 text-muted-foreground">
                          Limited forecast support:{" "}
                          {team.researchPlayers
                            .map((player) => player.playerName)
                            .join(", ")}
                          .
                        </p>
                      ) : null}
                      {team.unmodeled.length ? (
                        <p className="mt-3 text-muted-foreground">
                          {basis === "historical"
                            ? "No supported season GAR: "
                            : "No supported projection: "}
                          {team.unmodeled
                            .map((player) => player.playerName)
                            .join(", ")}
                          . These players may change the selected roster when a
                          rating becomes available.
                        </p>
                      ) : null}
                      {team.unallocated.length ? (
                        <p className="mt-3 text-muted-foreground">
                          Club contribution not yet allocated:{" "}
                          {team.unallocated
                            .map((player) => player.playerName)
                            .join(", ")}
                          . Their full-season GAR is not copied to multiple
                          teams.
                        </p>
                      ) : null}
                    </details>
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted-foreground">
        Rankings compare available{" "}
        {basis === "historical"
          ? "season contributions on recorded rosters"
          : "projections on each stored current roster"}
        . Partial rosters show a subtotal. Unrated players are excluded, and
        limited-support forecasts or unrated roster players make a ranking
        provisional.
      </p>
    </section>
  );
}
