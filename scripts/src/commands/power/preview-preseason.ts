import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { env } from "../../env";
import {
  configureConvexTarget,
  fetchModel,
  fetchSeasonModel,
  fetchSeasonDraftPicks,
} from "../../integrations/data/convex-store";
import { buildPreseasonProjections } from "../../runtime/preseason-projection";

const { values } = parseArgs({
  options: {
    year: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help) {
  console.log(
    "Read-only production preseason preview. --year <season year> required; --output <directory> optional. Reads teams, draft, current player directory, and previous three NHL seasons. Writes local review files only.",
  );
} else {
  if (!values.year) throw new Error("--year is required");
  configureConvexTarget("production");
  const deployment = env.CONVEX_DEPLOYMENT?.startsWith("prod:")
    ? env.CONVEX_DEPLOYMENT
    : env.CONVEX_DEPLOY_KEY?.split("|", 1)[0];
  const target = new URL(
    env.CONVEX_PROD_URL ??
      (deployment?.startsWith("prod:")
        ? `https://${deployment.slice(5)}.convex.cloud`
        : ""),
  ).origin;
  env.CONVEX_PROD_URL = target;
  console.log(
    JSON.stringify({ target, mode: "read-only", seasonYear: values.year }),
  );
  const seasons = await fetchModel("Season");
  const season = seasons.find((row) => String(row.year) === values.year);
  if (!season) throw new Error("Season not found");
  const seasonId = String(season.id);
  const [rawTeams, picks, players, weeks, franchises] = await Promise.all([
    fetchSeasonModel("Team", seasonId),
    fetchSeasonDraftPicks(seasonId),
    fetchModel("Player"),
    fetchSeasonModel("Week", seasonId),
    fetchModel("Franchise"),
  ]);
  const teams = rawTeams.map((team) => ({
    ...team,
    id: team.id,
    name: franchises.find((franchise) => franchise.id === team.franchiseId)
      ?.name,
  }));
  const opening = weeks.map((week) => String(week.startDate)).sort()[0];
  if (opening && opening.slice(0, 10) <= new Date().toISOString().slice(0, 10))
    throw new Error(
      "Current-roster preview requires a season that has not started",
    );
  const prior = seasons.filter(
    (row) =>
      Number(row.year) < Number(season.year) &&
      Number(row.year) >= Number(season.year) - 3,
  );
  const playerNhlRows = (
    await Promise.all(
      prior.map((row) => fetchSeasonModel("PlayerNHLStatLine", String(row.id))),
    )
  ).flat();
  const teamIds = new Set(teams.map((team) => String(team.id)));
  const rosters = players
    .filter((player) => teamIds.has(String(player.gshlTeamId)))
    .map((player) => ({ ...player, playerId: player.id }));
  const source = { season, seasons, teams, rosters, playerNhlRows };
  const rankings = buildPreseasonProjections(source);
  const directory = resolve(values.output ?? "../.local-data/preseason");
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "source.json"), JSON.stringify(source));
  await writeFile(
    resolve(directory, "rankings.json"),
    JSON.stringify(rankings, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        season: season.name,
        year: season.year,
        categories: season.categories,
        teams: teams.length,
        rosters: rosters.length,
        selectedPicks: picks.filter((pick) => pick.playerId).length,
        priorRows: playerNhlRows.length,
        rankings: rankings.map((row) => ({
          rank: row.rank,
          team: teams.find((team) => team.id === row.teamId)?.name,
          rating: Number(row.rating.toFixed(2)),
          unprovenPlayers: row.unprovenPlayers,
          goalieQualification: Number(row.goalieQualification.toFixed(3)),
        })),
      },
      null,
      2,
    ),
  );
}
