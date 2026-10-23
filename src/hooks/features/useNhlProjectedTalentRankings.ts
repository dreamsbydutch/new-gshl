"use client";
import { useMemo, useState } from "react";
import { useNhlTalentPlayers } from "../main/useNhlTalentPlayers";
import {
  parseConditionalNhlTalentArtifact,
  predictConditionalNhlTalent,
} from "../../lib/utils/domain/nhl-conditional-talent";
import {
  parseNhlTalentForecastArtifact,
  predictNhlContractTalent,
} from "../../lib/utils/domain/nhl-contract-talent-forecast";
import rateJson from "../../lib/data/nhl-conditional-talent.json";
import annualJson from "../../lib/data/nhl-contract-talent-forecast.json";

const rate = parseConditionalNhlTalentArtifact(rateJson);
const annual = parseNhlTalentForecastArtifact(annualJson);
export function useNhlProjectedTalentRankings() {
  const data = useNhlTalentPlayers();
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("all");
  const [page, setPage] = useState(0);
  const stale = data.seasonStartYear !== rate.cutoffYear;
  const rows = useMemo(
    () =>
      data.players
        .map((player) => {
          const ratePrediction =
            !stale && player.nhlPlayerId
              ? predictConditionalNhlTalent(
                  rate,
                  player.nhlPlayerId,
                  data.seasonStartYear + 1,
                )
              : null;
          const forecast =
            ratePrediction?.position === player.position
              ? ratePrediction
              : null;
          const outputPrediction =
            !stale &&
            annual.cutoffYear === data.seasonStartYear &&
            player.nhlPlayerId
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
          return { ...player, forecast, expected, last };
        })
        .sort(
          (a, b) =>
            (b.forecast?.ratePer60 ?? -Infinity) -
              (a.forecast?.ratePer60 ?? -Infinity) ||
            a.playerName.localeCompare(b.playerName),
        )
        .filter(
          (player) =>
            (position === "all" || player.position === position) &&
            `${player.playerName} ${player.nhlTeam.join(" ")}`
              .toLowerCase()
              .includes(search.trim().toLowerCase()),
        ),
    [data.players, data.seasonStartYear, stale, search, position],
  );
  const pages = Math.max(1, Math.ceil(rows.length / 50)),
    currentPage = Math.min(page, pages - 1);
  return {
    ...data,
    stale,
    cutoffYear: rate.cutoffYear,
    rows: rows.slice(currentPage * 50, (currentPage + 1) * 50),
    total: rows.length,
    page: currentPage,
    pages,
    search,
    position,
    setPage,
    changeSearch: (value: string) => {
      setSearch(value);
      setPage(0);
    },
    changePosition: (value: string) => {
      setPosition(value);
      setPage(0);
    },
  };
}
