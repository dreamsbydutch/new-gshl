"use client";

import { useState } from "react";
import { useRecords } from "@gshl-hooks/features/useRecords";
import { RECORD_LABELS } from "@gshl-utils/features/records";
import { cn } from "@gshl-utils";

const control =
  "min-h-11 w-full rounded border border-slate-300 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500";
const toggle =
  "min-h-11 flex-1 border-b-2 px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-500";

export function RecordsContent() {
  const records = useRecords();
  const [showFilters, setShowFilters] = useState(false);
  const isPlayer = records.subject === "player";
  const statLabel =
    records.stat === "GP" && !isPlayer
      ? "Player games"
      : RECORD_LABELS[records.stat];
  const phase =
    records.seasonType === "RS"
      ? "Regular season"
      : records.seasonType === "PO"
        ? "Playoffs"
        : records.seasonType === "LT"
          ? "Loser tournament"
          : "All season types";
  return (
    <main className="gshl-page" aria-labelledby="records-heading">
      <h1 id="records-heading" className="sr-only">
        GSHL records
      </h1>
      <div className="flex flex-wrap gap-x-4 border-b border-slate-200">
        <div role="group" aria-label="Record holders" className="flex flex-1">
          {(["player", "team"] as const).map((subject) => (
            <button
              key={subject}
              type="button"
              aria-pressed={records.subject === subject}
              onClick={() => records.setSubject(subject)}
              className={cn(
                toggle,
                records.subject === subject
                  ? "border-slate-950 text-slate-950"
                  : "border-transparent text-slate-500",
              )}
            >
              {subject === "player" ? "Players" : "Owners"}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Record period" className="flex flex-[2]">
          {(["career", "season", "week"] as const).map((period) => (
            <button
              key={period}
              type="button"
              aria-pressed={records.period === period}
              onClick={() => records.setPeriod(period)}
              className={cn(
                toggle,
                records.period === period
                  ? "border-slate-950 text-slate-950"
                  : "border-transparent text-slate-500",
              )}
            >
              {period === "career"
                ? "Career"
                : period === "season"
                  ? "Season"
                  : "Week"}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 py-2">
        <label className="min-w-0 text-xs font-medium text-slate-600">
          Rank by
          <select
            className={control}
            value={records.stat}
            onChange={(event) => records.setStat(event.target.value)}
          >
            {records.stats.map((stat) => (
              <option key={stat} value={stat}>
                {stat === "GP" && !isPlayer
                  ? "Player games"
                  : RECORD_LABELS[stat]}
              </option>
            ))}
          </select>
        </label>
        {records.period !== "career" ? (
          <label className="min-w-0 text-xs font-medium text-slate-600">
            Seasons
            <select
              className={control}
              value={records.seasonId}
              onChange={(event) => records.setSeasonId(event.target.value)}
            >
              <option value="">All seasons</option>
              {[...records.seasons].reverse().map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="flex items-end pb-3 text-xs text-slate-500">
            All recorded GSHL seasons
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-b border-slate-200">
        <p className="text-xs text-slate-500">
          {phase}
          {records.rate ? ` · Minimum ${records.minimumGames} games` : ""}
        </p>
        <button
          type="button"
          className="gshl-text-action"
          aria-expanded={showFilters}
          aria-controls="record-filters"
          onClick={() => setShowFilters(!showFilters)}
        >
          Filters
        </button>
      </div>
      <div
        id="record-filters"
        className={cn(
          "grid-cols-2 gap-2 border-b border-slate-200 py-2",
          showFilters ? "grid" : "hidden",
        )}
      >
        <label className="text-xs font-medium text-slate-600">
          Season type
          <select
            className={control}
            value={records.seasonType}
            onChange={(event) => records.setSeasonType(event.target.value)}
          >
            <option value="RS">Regular season</option>
            <option value="PO">Playoffs</option>
            <option value="LT">Loser tournament</option>
            <option value="">All types</option>
          </select>
        </label>
        {isPlayer && (
          <label className="text-xs font-medium text-slate-600">
            Players
            <select
              className={control}
              value={records.position}
              onChange={(event) =>
                records.setPosition(
                  event.target.value as "all" | "skater" | "goalie",
                )
              }
            >
              <option value="all">All players</option>
              <option value="skater">Skaters</option>
              <option value="goalie">Goalies</option>
            </select>
          </label>
        )}
        <label className="text-xs font-medium text-slate-600">
          Minimum {isPlayer ? "games" : "player games"}
          <input
            className={control}
            type="number"
            min={1}
            max={100000}
            step={1}
            value={records.minimumGames}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isInteger(value) && value >= 1 && value <= 100000)
                records.setMinimumGames(value);
            }}
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Search top 100
          <input
            className={control}
            type="search"
            value={records.search}
            placeholder={isPlayer ? "Player or team" : "Owner or team"}
            onChange={(event) => records.setSearch(event.target.value)}
          />
        </label>
      </div>
      <div className="flex items-center justify-between gap-3 py-2">
        <h2 className="gshl-section-title">{statLabel} leaders</h2>
        <span className="text-xs text-slate-500">
          Top 100
          {records.stat === "GAA" ? " · Lowest first" : ""}
        </span>
      </div>
      {records.period === "career" && (
        <p className="pb-2 text-xs text-slate-500">
          {isPlayer
            ? "GSHL totals across all teams; excludes NHL-only statistics."
            : "Owner totals across all their recorded GSHL teams and seasons."}
        </p>
      )}
      {records.isLoading ? (
        <p role="status" className="py-3 text-sm text-slate-500">
          Loading records…
        </p>
      ) : records.error ? (
        <div role="alert" className="py-3 text-sm text-red-700">
          {records.error}{" "}
          <button
            type="button"
            onClick={records.refresh}
            className="gshl-text-action"
          >
            Retry
          </button>
        </div>
      ) : records.rows.length === 0 ? (
        <p role="status" className="py-3 text-sm text-slate-500">
          No qualifying records match these filters.
        </p>
      ) : (
        <ol
          aria-label={`${statLabel} leaderboard`}
          className="divide-y divide-slate-200"
        >
          {records.rows.map((row) => (
            <li
              key={row.id}
              value={row.rank}
              className="grid min-h-11 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 py-2"
            >
              <span
                className="text-xs tabular-nums text-slate-500"
                aria-label={`Rank ${row.rank}`}
              >
                {row.rank}
              </span>
              <div className="min-w-0">
                <p
                  className="truncate text-sm font-semibold text-slate-950"
                  title={isPlayer ? row.name : row.ownerName}
                >
                  {isPlayer ? row.name : (row.ownerName ?? "Owner unavailable")}
                </p>
                <p className="truncate text-xs text-slate-500" title={row.team}>
                  {[
                    records.period !== "career" ? row.season : "",
                    records.period === "week" ? row.period : "",
                    row.team,
                    isPlayer ? row.position : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <span className="text-base font-semibold tabular-nums text-slate-950">
                {row.stats[records.stat]?.toLocaleString("en-CA", {
                  maximumFractionDigits: records.stat === "SVP" ? 4 : 2,
                }) ?? "—"}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="border-t border-slate-200 py-2 text-[11px] text-slate-500">
        Recorded GSHL statistics only. Tied values share a rank.{" "}
        {records.period !== "career"
          ? "Each row is a separate performance."
          : isPlayer
            ? "Career goalie rates use combined saves, shots, goals against, and ice time."
            : "Career totals combine teams linked to the same owner."}
      </p>
    </main>
  );
}
