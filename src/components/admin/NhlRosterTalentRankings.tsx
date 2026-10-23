import { Fragment } from "react";
import type { useNormalizedNhlRosters } from "../../hooks/features/useNormalizedNhlRosters";

const gar = (value: number | null) =>
  value === null ? "\u2014" : `${value > 0 ? "+" : ""}${value.toFixed(2)}`;

export function NhlRosterTalentRankings({
  teams,
  basis,
  usageBasis = "standard",
}: {
  teams: ReturnType<typeof useNormalizedNhlRosters>["talentTeams"];
  basis: "projected" | "historical" | "conditional";
  usageBasis?: "projected" | "standard";
}) {
  return (
    <section className="space-y-3" aria-labelledby="nhl-team-talent-heading">
      <h3 id="nhl-team-talent-heading" className="text-lg font-semibold">
        {basis === "historical"
          ? "Historical NHL season contribution"
          : basis === "conditional"
            ? usageBasis === "projected"
              ? "Projected playing talent with estimated deployment"
              : "Playing talent at standard lineup usage"
            : "Expected NHL season contribution"}
      </h3>
      <p className="text-sm text-muted-foreground">
        {basis === "historical"
          ? "Top recorded season GAR from up to 14 forwards, 8 defensemen and 2 goalies. Uses actual season contribution, without forecasts or an 82-game extrapolation. Traded players await verified club allocations."
          : basis === "conditional"
            ? usageBasis === "projected"
              ? "Fills 14 forward, 8 defense and 2 goalie slots, with NHL roster players first. Estimated minutes per appearance determine skater deployment within a shared team budget, including reserve rotation. Goalies retain a 65/35 split. This compares talent when available; it does not predict injuries or season participation."
              : "Fills 14 forward, 8 defense and 2 goalie slots with NHL roster players first. Standard depth slots share 180 forward, 120 defense and 60 goalie minutes per game, including reserve rotation and a 65/35 goalie split. This is a common usage scenario, not a coaching forecast."
            : "Fills 14 forward, 8 defense and 2 goalie slots: official NHL roster players first, then the highest-rated listed organizational depth. Expected GAR includes workload and participation risk; it does not predict standings."}
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[650px] text-sm tabular-nums">
          <caption className="sr-only">
            Complete NHL team ratings ordered by{" "}
            {basis === "historical" ? "recorded season" : "projected"} GAR,
            followed by incomplete teams alphabetically
          </caption>
          <thead className="bg-gray-100 text-left">
            <tr>
              <th scope="col" className="p-3">
                Rank (complete teams)
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
              <th
                scope="col"
                className="p-3 text-right"
                aria-sort={
                  teams.some((team) => !team.complete) ? "other" : "descending"
                }
              >
                {basis === "historical"
                  ? "Recorded GAR"
                  : basis === "conditional"
                    ? "Lineup talent GAR/82"
                    : "Expected GAR/82"}
              </th>
              <th scope="col" className="p-3 text-right">
                Roster F / D / G
              </th>
              <th scope="col" className="p-3 text-right">
                Unrated slots
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
                      {gar(group.ratedPlayers ? group.total : null)}
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
                    {!team.slotsComplete
                      ? "Missing roster slots"
                      : usageBasis === "projected" &&
                          "usageComplete" in team &&
                          !team.usageComplete
                        ? "Incomplete deployment"
                        : !team.complete
                          ? "Incomplete ratings"
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
                      <div className="mt-3 grid gap-5 xl:grid-cols-3">
                        {team.groups.map((group) => (
                          <div key={group.position}>
                            <h4 className="mb-2 font-semibold">
                              {group.position === "F"
                                ? "Forwards"
                                : group.position === "D"
                                  ? "Defensemen"
                                  : "Goalies"}
                              {basis === "conditional" &&
                              usageBasis === "projected" &&
                              "allocationBasis" in group &&
                              (group.allocationBasis === "standard-fallback" ||
                                group.allocationBasis ===
                                  "partial-projected") ? (
                                <span className="ml-2 text-xs font-normal text-muted-foreground">
                                  Includes standard usage
                                </span>
                              ) : null}
                            </h4>
                            {basis === "conditional" ? (
                              <div className="mb-2 grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_4.5rem] gap-2 text-xs text-muted-foreground">
                                <span>Player</span>
                                <span className="text-right">GAR/60</span>
                                <span className="text-right">Min/game</span>
                                <span className="text-right">Lineup GAR</span>
                              </div>
                            ) : null}
                            <ol className="space-y-1">
                              {group.roster.map((player, i) => (
                                <li
                                  key={player.id}
                                  className={
                                    basis === "conditional"
                                      ? "grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_4.5rem] gap-2"
                                      : "flex justify-between gap-3"
                                  }
                                >
                                  <span>
                                    {i + 1}. {player.playerName}
                                    {player.membership ? (
                                      <span className="ml-1 text-xs text-muted-foreground">
                                        {player.membership === "nhl-roster"
                                          ? "NHL"
                                          : "Depth"}
                                      </span>
                                    ) : null}
                                  </span>
                                  {basis === "conditional" ? (
                                    <span className="text-right font-semibold">
                                      {player.ratePer60 == null
                                        ? "\u2014"
                                        : `${player.ratePer60 > 0 ? "+" : ""}${player.ratePer60.toFixed(3)}`}
                                    </span>
                                  ) : null}
                                  {basis === "conditional" ? (
                                    <span
                                      className="text-right"
                                      title={
                                        group.position === "G"
                                          ? "Allocated using the fixed 65/35 goalie split"
                                          : usageBasis === "projected" &&
                                              "projectedMinutesPerAppearance" in
                                                player &&
                                              typeof player.projectedMinutesPerAppearance ===
                                                "number"
                                            ? `Forecast: ${player.projectedMinutesPerAppearance.toFixed(1)} minutes per appearance. Displayed minutes are normalized to the team budget.`
                                            : "Standard depth-slot allocation; no individual deployment forecast is used"
                                      }
                                    >
                                      {player.minutesPerTeamGame?.toFixed(1) ??
                                        "\u2014"}
                                    </span>
                                  ) : null}
                                  <span
                                    className="text-right"
                                    title={
                                      basis === "conditional" &&
                                      player.ratePer60 != null
                                        ? `${gar(player.ratePer60)} GAR/60 × ${player.minutesPerTeamGame?.toFixed(1)} minutes per team game × 82 games / 60`
                                        : undefined
                                    }
                                  >
                                    {gar(player.gar)}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        ))}
                      </div>
                      {basis === "conditional" ? (
                        <p className="mt-3 text-xs text-muted-foreground">
                          GAR/60 is individual talent; lineup GAR applies the
                          allocated minutes over 82 games.{" "}
                          {usageBasis === "projected"
                            ? "Skater minutes reflect estimated roles, normalized to the team budget."
                            : "Minutes follow standard depth-slot weights."}{" "}
                          Small rate differences do not establish a meaningful
                          difference in ability.
                        </p>
                      ) : null}
                      {basis === "conditional" &&
                      "allocationBasis" in team &&
                      (team.allocationBasis === "standard-fallback" ||
                        team.allocationBasis === "partial-projected") ? (
                        <p className="mt-3 text-muted-foreground">
                          Deployment estimates are incomplete. Missing estimates
                          keep standard slot shares; known roles use the
                          remaining budget. This comparison is unranked.
                        </p>
                      ) : null}
                      {!team.complete ? (
                        <p className="mt-3">
                          Known contribution: {gar(team.knownSubtotal)} GAR.
                          Missing position slots are not filled with zero.
                        </p>
                      ) : null}
                      {team.researchPlayers.length ? (
                        <p className="mt-3 text-muted-foreground">
                          Lower-confidence ratings (included in total):{" "}
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
                            : "Unrated selected players: "}
                          {team.unmodeled
                            .map((player) => player.playerName)
                            .join(", ")}
                          .{" "}
                          {basis === "historical"
                            ? "Their contribution remains unknown."
                            : "Their roster slots are retained. The team total is incomplete."}
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
          : "projections on official NHL roster and organization directory listings"}
        . Only teams with all 14 forward, 8 defense and 2 goalie ratings receive
        a rank. Partial rosters show a subtotal and follow the ranked teams in
        alphabetical order. Lower-confidence estimates remain included and make
        complete-team rankings provisional.
      </p>
    </section>
  );
}
