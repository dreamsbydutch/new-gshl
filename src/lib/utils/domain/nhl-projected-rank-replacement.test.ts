import assert from "node:assert/strict";
import { test } from "node:test";
import averageJson from "../../data/nhl-average-talent.json";
import conditionalJson from "../../data/nhl-conditional-talent.json";
import usageJson from "../../data/nhl-lineup-usage.json";
import goalieJson from "../../data/nhl-goalie-usage.json";
import type { NhlOrganizations } from "../../types/nhl-organizations";
import {
  parseAverageNhlTalentArtifact,
  predictAverageNhlTalent,
} from "./nhl-average-talent";
import { parseConditionalNhlTalentArtifact } from "./nhl-conditional-talent";
import { parseNhlLineupUsageArtifact } from "./nhl-lineup-usage";
import { parseNhlGoalieUsageArtifact } from "./nhl-goalie-usage";
import { fitNhlRankReplacement } from "./nhl-rank-replacement";
import {
  buildProjectedNhlLineupGar,
  indexProjectedNhlLineupGar,
} from "./nhl-projected-lineup-gar";

void test("rank replacement shares one player/team GAR calculation and never restores positional offsets", () => {
  const average = parseAverageNhlTalentArtifact(averageJson);
  const conditional = parseConditionalNhlTalentArtifact(conditionalJson);
  const organizations: NhlOrganizations = {
    seasonId: 20262027,
    updatedAt: 1,
    teams: Array.from({ length: 32 }, (_, i) => ({
      abbr: `A${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`,
      name: `Club ${i}`,
      roster: [],
    })),
  };
  for (const position of ["F", "D", "G"] as const) {
    average.profiles
      .filter(
        (p) =>
          p.position === position &&
          predictAverageNhlTalent(average, p.nhlPlayerId, 2027)
            .rateAboveAveragePer60 !== null,
      )
      .forEach((p, i) =>
        organizations.teams[i % 32]!.roster.push({
          nhlPlayerId: p.nhlPlayerId,
          playerName: String(p.nhlPlayerId),
          position,
          membership: "nhl-roster",
        }),
      );
  }
  const replacement = fitNhlRankReplacement(organizations, average, 2027);
  const teams = buildProjectedNhlLineupGar(
    organizations,
    conditional,
    parseNhlLineupUsageArtifact(usageJson),
    2027,
    "projected",
    parseNhlGoalieUsageArtifact(goalieJson),
    replacement,
  );
  const index = indexProjectedNhlLineupGar(teams);
  for (const team of teams) {
    assert.ok(
      Math.abs(
        team.selected.reduce(
          (sum, p) => sum + (index.get(p.nhlPlayerId!)!.gar ?? 0),
          0,
        ) - team.modeledGar!,
      ) < 1e-9,
    );
    for (const player of team.selected) {
      const playing = predictAverageNhlTalent(
        average,
        player.nhlPlayerId!,
        2027,
      );
      const reference =
        replacement.references[player.position as "F" | "D" | "G"];
      assert.equal(
        player.ratePer60,
        playing.rateAboveAveragePer60! - reference.rateAboveAveragePer60,
      );
      assert.equal(
        player.gar,
        (player.ratePer60 * player.minutesPerTeamGame * 82) / 60,
      );
    }
  }
  assert.ok(teams.flatMap((t) => t.selected).some((p) => p.gar! < 0));
  for (const reference of Object.values(replacement.references))
    assert.equal(index.get(reference.boundaryPlayerId)!.ratePer60, 0);
  assert.throws(
    () =>
      buildProjectedNhlLineupGar(
        { ...organizations, teams: organizations.teams.slice(1) },
        conditional,
        parseNhlLineupUsageArtifact(usageJson),
        2027,
        "standard",
        undefined,
        replacement,
      ),
    /population/,
  );
  assert.throws(
    () =>
      buildProjectedNhlLineupGar(
        organizations,
        { ...conditional, sourceSha256: "b".repeat(64) },
        parseNhlLineupUsageArtifact(usageJson),
        2027,
        "standard",
        undefined,
        replacement,
      ),
    /same source/,
  );
});
