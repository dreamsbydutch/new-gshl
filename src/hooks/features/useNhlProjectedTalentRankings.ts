"use client";
import { useMemo, useState } from "react";
import { useNhlTalentPlayers } from "../main/useNhlTalentPlayers";
import { useNhlOrganizations } from "../main/useNhlOrganizations";
import { parseConditionalNhlTalentArtifact } from "../../lib/utils/domain/nhl-conditional-talent";
import {
  parseNhlTalentForecastArtifact,
  predictNhlContractTalent,
} from "../../lib/utils/domain/nhl-contract-talent-forecast";
import rateJson from "../../lib/data/nhl-conditional-talent.json";
import annualJson from "../../lib/data/nhl-contract-talent-forecast.json";
import averageJson from "../../lib/data/nhl-average-talent.json";
import usageJson from "../../lib/data/nhl-lineup-usage.json";
import goalieUsageJson from "../../lib/data/nhl-goalie-usage.json";
import { parseNhlGoalieUsageArtifact } from "../../lib/utils/domain/nhl-goalie-usage";
import { parseNhlLineupUsageArtifact } from "../../lib/utils/domain/nhl-lineup-usage";
import {
  buildProjectedNhlLineupGar,
  indexProjectedNhlLineupGar,
} from "../../lib/utils/domain/nhl-projected-lineup-gar";
import {
  parseAverageNhlTalentArtifact,
  predictAverageNhlTalent,
} from "../../lib/utils/domain/nhl-average-talent";
import {
  fitNhlRankReplacement,
  projectNhlRankReplacement,
} from "../../lib/utils/domain/nhl-rank-replacement";

const rate = parseConditionalNhlTalentArtifact(rateJson);
const annual = parseNhlTalentForecastArtifact(annualJson);
const average = parseAverageNhlTalentArtifact(averageJson);
const usage = parseNhlLineupUsageArtifact(usageJson);
const goalieUsage = parseNhlGoalieUsageArtifact(goalieUsageJson);
export function useNhlProjectedTalentRankings() {
  const data = useNhlTalentPlayers();
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("all");
  const [page, setPage] = useState(0);
  const [ordering, setOrdering] = useState("gar");
  const stale =
    data.seasonStartYear !== rate.cutoffYear ||
    data.seasonStartYear !== usage.cutoffYear ||
    data.seasonStartYear !== average.cutoffYear ||
    data.seasonStartYear !== goalieUsage.cutoffYear;
  const organizations = useNhlOrganizations(
    stale ? null : data.seasonStartYear,
  );
  const replacementState = useMemo(() => {
    if (stale || !organizations.data) return { calibration: null, error: null };
    try {
      return {
        calibration: fitNhlRankReplacement(
          organizations.data,
          average,
          data.seasonStartYear + 1,
        ),
        error: null,
      };
    } catch {
      return {
        calibration: null,
        error:
          "The replacement baseline needs complete NHL organization coverage and enough rated players at each position.",
      };
    }
  }, [stale, organizations.data, data.seasonStartYear]);
  const projectedPlayers = useMemo(
    () =>
      indexProjectedNhlLineupGar(
        !stale && organizations.data && replacementState.calibration
          ? buildProjectedNhlLineupGar(
              organizations.data,
              rate,
              usage,
              data.seasonStartYear + 1,
              "projected",
              goalieUsage,
              replacementState.calibration,
            )
          : [],
      ),
    [
      stale,
      organizations.data,
      data.seasonStartYear,
      replacementState.calibration,
    ],
  );
  const rows = useMemo(
    () =>
      data.players
        .map((player) => {
          const ratePrediction =
            replacementState.calibration && player.nhlPlayerId
              ? projectNhlRankReplacement(
                  replacementState.calibration,
                  player.nhlPlayerId,
                )
              : null;
          const forecast =
            ratePrediction?.position === player.position
              ? ratePrediction
              : null;
          const averagePrediction =
            data.seasonStartYear === average.cutoffYear && player.nhlPlayerId
              ? predictAverageNhlTalent(
                  average,
                  player.nhlPlayerId,
                  data.seasonStartYear + 1,
                )
              : null;
          const value =
            averagePrediction?.position === player.position
              ? averagePrediction
              : null;
          const outputPrediction =
            annual.cutoffYear === data.seasonStartYear && player.nhlPlayerId
              ? predictNhlContractTalent(annual, {
                  nhlPlayerId: player.nhlPlayerId,
                  targetYear: data.seasonStartYear + 1,
                })
              : null;
          const expected =
            outputPrediction?.position === player.position
              ? outputPrediction
              : null;
          const last = rate.profiles
            .find((p) => p.nhlPlayerId === player.nhlPlayerId)
            ?.observations.at(-1);
          const lineup = player.nhlPlayerId
            ? projectedPlayers.get(player.nhlPlayerId)
            : null;
          const projected =
            lineup?.position === player.position ? lineup : null;
          return {
            ...player,
            forecast,
            value,
            projected,
            displayTeams:
              ordering === "gar" && projected
                ? [projected.teamAbbr]
                : player.nhlTeam,
            evidence: ordering === "average" ? value : forecast,
            expected,
            last,
          };
        })
        .sort(
          (a, b) =>
            (ordering === "average"
              ? (b.value?.standardSeasonGoalsAboveAverage ?? -Infinity) -
                (a.value?.standardSeasonGoalsAboveAverage ?? -Infinity)
              : (b.projected?.gar ?? -Infinity) -
                (a.projected?.gar ?? -Infinity)) ||
            a.playerName.localeCompare(b.playerName),
        )
        .filter(
          (player) =>
            (position === "all" || player.position === position) &&
            `${player.playerName} ${player.displayTeams.join(" ")}`
              .toLowerCase()
              .includes(search.trim().toLowerCase()),
        ),
    [
      data.players,
      data.seasonStartYear,
      search,
      position,
      ordering,
      projectedPlayers,
      replacementState.calibration,
    ],
  );
  const pages = Math.max(1, Math.ceil(rows.length / 50)),
    currentPage = Math.min(page, pages - 1);
  return {
    ...data,
    isLoading:
      data.isLoading || (ordering === "gar" && organizations.isLoading),
    stale:
      ordering === "average"
        ? data.seasonStartYear !== average.cutoffYear
        : stale,
    organizationError:
      ordering === "gar"
        ? (organizations.error ?? replacementState.error)
        : null,
    replacementReferences: replacementState.calibration?.references ?? null,
    retryOrganizations: organizations.retry,
    cutoffYear: rate.cutoffYear,
    rows: rows.slice(currentPage * 50, (currentPage + 1) * 50),
    total: rows.length,
    page: currentPage,
    pages,
    search,
    position,
    ordering,
    standardWorkloads: average.standardWorkloads,
    setPage,
    changeSearch: (value: string) => {
      setSearch(value);
      setPage(0);
    },
    changePosition: (value: string) => {
      setPosition(value);
      setPage(0);
    },
    changeOrdering: (value: string) => {
      setOrdering(value === "average" ? "average" : "gar");
      setPage(0);
    },
  };
}
