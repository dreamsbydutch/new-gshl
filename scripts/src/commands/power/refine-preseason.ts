import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildPreseasonProjections,
  standardized,
  type PreseasonProjectionOptions,
} from "../../runtime/preseason-projection";
import { projectOwners } from "../../runtime/owner-projection";
import type { DatabaseRecord as Row } from "../../integrations/data/records";

if (process.argv.includes("--help")) {
  console.log(
    "Local-only preseason refinement from cached power research. Writes .local-data/power-objectives/refinement.json. No network or league writes.",
  );
} else {
  const root = resolve("../.local-data");
  const source = JSON.parse(
    await readFile(resolve(root, "draft-slot-research/source.json"), "utf8"),
  ) as {
    seasonRows: Row[];
    draftPickRows: Row[];
    playerNhlRows: Row[];
    teamSeasonRows: Row[];
  };
  const identities = JSON.parse(
    await readFile(resolve(root, "draft-signings-source.json"), "utf8"),
  ) as { teams: Row[]; franchises: Row[] };
  const settings: { name: string; options: PreseasonProjectionOptions }[] = [
    {
      name: "baseline",
      options: {
        recency: [1, 0.6, 0.3],
        skaterPriorGames: 30,
        goaliePriorGames: 50,
      },
    },
    {
      name: "recent",
      options: {
        recency: [1, 0.3, 0.1],
        skaterPriorGames: 30,
        goaliePriorGames: 50,
      },
    },
    {
      name: "last-season",
      options: {
        recency: [1, 0, 0],
        skaterPriorGames: 30,
        goaliePriorGames: 50,
      },
    },
    {
      name: "less-shrink",
      options: {
        recency: [1, 0.6, 0.3],
        skaterPriorGames: 15,
        goaliePriorGames: 25,
      },
    },
    {
      name: "more-shrink",
      options: {
        recency: [1, 0.6, 0.3],
        skaterPriorGames: 60,
        goaliePriorGames: 100,
      },
    },
  ];
  const results: {
    year: number;
    variants: { name: string; mae: number; correlation: number }[];
  }[] = [];
  const baselineFeatures: {
    year: number;
    seasonId: string;
    teams: {
      teamId: string;
      rosterScore: number;
      ownerScore: number;
      standings: number;
    }[];
  }[] = [];
  for (const season of source.seasonRows.filter(
    (s) => Number(s.year) >= 2019 && Number(s.year) <= 2026,
  )) {
    const actual = source.teamSeasonRows.filter(
      (row) =>
        row.seasonId === season.id &&
        row.seasonType === "RS" &&
        Number(row.GP) > 0,
    );
    const teams = actual.map(
      (row) => identities.teams.find((team) => team.id === row.gshlTeamId)!,
    );
    const input = {
      season,
      seasons: source.seasonRows,
      teams,
      rosters: source.draftPickRows.filter(
        (row) => row.seasonId === season.id && row.playerId,
      ),
      playerNhlRows: source.playerNhlRows,
    };
    const owner = projectOwners({
      ...input,
      historicalTeams: identities.teams,
      franchises: identities.franchises,
      teamSeasons: source.teamSeasonRows,
    });
    const variants = [];
    for (const setting of settings) {
      const projection = buildPreseasonProjections(input, setting.options);
      if (setting.name === "baseline")
        baselineFeatures.push({
          year: Number(season.year),
          seasonId: String(season.id),
          teams: teams.map((team, i) => ({
            teamId: String(team.id),
            rosterScore: projection.find((p) => p.teamId === team.id)!.score,
            ownerScore: owner.get(String(team.id))!.score,
            standings: Number(actual[i]!.overallRk),
          })),
        });
      for (const aggregation of ["linear", "pairwise"]) {
        const raw = teams.map((team) => {
          const profile = projection.find((p) => p.teamId === team.id)!;
          if (aggregation === "linear") return profile.score;
          const fields = Object.keys(profile.categoryStrength);
          return (
            projection
              .filter((p) => p.teamId !== team.id)
              .reduce(
                (sum, other) =>
                  sum +
                  fields.reduce(
                    (sum, field) =>
                      sum +
                      1 /
                        (1 +
                          Math.exp(
                            -(
                              profile.categoryStrength[field]! -
                              other.categoryStrength[field]!
                            ),
                          )),
                    0,
                  ) /
                    fields.length,
                0,
              ) /
            (teams.length - 1)
          );
        });
        const rosterScores = standardized(raw);
        const scores = teams.map(
          (team, i) =>
            0.5 * rosterScores[i]! + 0.5 * owner.get(String(team.id))!.score,
        );
        const ranks = scores.map(
          (score) =>
            1 +
            scores.filter((s) => s > score).length +
            (scores.filter((s) => s === score).length - 1) / 2,
        );
        const standings = actual.map((row) => Number(row.overallRk));
        const truthZ = standardized(standings);
        variants.push({
          name: `${setting.name}/${aggregation}`,
          mae:
            ranks.reduce(
              (sum, rank, i) => sum + Math.abs(rank - standings[i]!),
              0,
            ) / teams.length,
          correlation:
            standardized(ranks).reduce(
              (sum, rank, i) => sum + rank * truthZ[i]!,
              0,
            ) / teams.length,
        });
      }
    }
    results.push({ year: Number(season.year), variants });
  }
  const summarize = (rows: typeof results) =>
    rows[0]!.variants.map((variant, index) => ({
      name: variant.name,
      mae:
        rows.reduce((sum, row) => sum + row.variants[index]!.mae, 0) /
        rows.length,
      correlation:
        rows.reduce((sum, row) => sum + row.variants[index]!.correlation, 0) /
        rows.length,
    }));
  const training = summarize(results.filter((r) => r.year <= 2023)),
    evaluation = summarize(results.filter((r) => r.year >= 2024));
  const selected = [...training].sort((a, b) => a.mae - b.mae)[0]!;
  const report = { training, evaluation, selected, seasons: results };
  await writeFile(
    resolve(root, "power-objectives/refinement.json"),
    JSON.stringify(report, null, 2),
  );
  await writeFile(
    resolve(root, "power-objectives/preseason-features.json"),
    JSON.stringify(baselineFeatures, null, 2),
  );
  console.log(JSON.stringify({ training, evaluation, selected }, null, 2));
}
