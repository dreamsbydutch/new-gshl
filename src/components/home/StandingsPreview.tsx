"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useHomeStandings } from "@gshl-hooks/features/useHomeStandings";
import { SectionHeading } from "@gshl-components/ui/SectionHeading";

const places = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th"];

export function StandingsPreview({ seasonId }: { seasonId: string }) {
  const view = useHomeStandings(seasonId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const teams = view.groups.flatMap((group) => group.teams);
  const selected = teams.find((team) => team.id === selectedId) ?? teams[0];
  const score = selected?.ranking?.rating;
  const scoreChange = selected?.ranking?.ratingChange;
  return (
    <section className="gshl-section" aria-labelledby="home-standings-heading">
      <SectionHeading
        id="home-standings-heading"
        title="Standings + power"
        href={view.standingsHref}
        action="Full standings"
      />
      <div className="mx-auto flex min-h-11 max-w-sm items-center justify-between gap-2 text-[11px] text-slate-500">
        <span title="Power rank is league-wide. Arrows show change since the previous published ranking.">
          League power · ↑↓ weekly
        </span>
        <Link
          href={view.powerHref}
          className="gshl-text-action shrink-0"
          title="Full power rankings"
        >
          {view.powerStatus ? "Power rankings" : `Power · ${view.powerLabel}`}
          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
      {view.isLoading ? (
        <p role="status" className="py-2 text-sm text-slate-500">
          Loading standings...
        </p>
      ) : !teams.length ? (
        <p className="py-2 text-sm text-slate-500">No standings yet.</p>
      ) : (
        <>
          <div className="mx-auto grid w-full max-w-sm grid-cols-[minmax(0,1fr)_1.75rem_minmax(0,1fr)] gap-x-0.5">
            <div aria-hidden="true" className="col-start-2 row-start-1">
              <div className="h-7" />
              <div className="flex h-6 items-center justify-center text-[10px] text-slate-500">
                Place
              </div>
              <ol>
                {places
                  .slice(
                    0,
                    Math.max(...view.groups.map((group) => group.teams.length)),
                  )
                  .map((place) => (
                    <li
                      key={place}
                      className="flex h-12 items-center justify-center border-t border-slate-100 text-[11px] font-semibold text-slate-600"
                    >
                      <span className="rounded bg-slate-100 px-0.5 py-1">
                        {place}
                      </span>
                    </li>
                  ))}
              </ol>
            </div>
            {view.groups.map((group, groupIndex) => (
              <div
                key={group.title}
                className={`row-start-1 min-w-0 ${groupIndex === 0 ? "col-start-1" : "col-start-3"}`}
              >
                <h3
                  title={group.title}
                  className="flex h-7 items-center justify-center truncate text-xs font-semibold text-slate-600"
                >
                  {group.title.replace(/ Conference$/i, "")}
                </h3>
                <div
                  aria-hidden="true"
                  className="grid h-6 grid-cols-[1.75rem_minmax(0,1fr)_minmax(2.75rem,1fr)] items-center gap-1 px-0.5 text-center text-[10px] text-slate-500"
                >
                  <span />
                  <span>{view.usesLegacyTies ? "W–L–T" : "W–L"}</span>
                  <span>Power #</span>
                </div>
                <ol aria-label={group.title}>
                  {group.teams.map((team) => {
                    const rank = team.ranking;
                    const movement = rank?.rankChange;
                    const movementLabel =
                      movement == null
                        ? "No previous ranking."
                        : movement === 0
                          ? "No rank change."
                          : `Rank ${movement > 0 ? "up" : "down"} ${Math.abs(movement)} since the previous ranking.`;
                    const label = `${team.name}, ${team.record}, ${places[team.place - 1] ?? team.place} in ${team.conference}. ${rank ? `League power rank ${rank.rank}, score ${rank.rating?.toFixed(1) ?? "unavailable"}. ${movementLabel}` : "Power ranking unavailable."} Show details.`;
                    return (
                      <li key={team.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(team.id)}
                          title={label}
                          aria-label={label}
                          aria-pressed={team.id === selected?.id}
                          className={`grid h-12 w-full grid-cols-[1.75rem_minmax(0,1fr)_minmax(2.75rem,1fr)] items-center gap-1 border-t border-slate-100 px-0.5 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${team.id === selected?.id ? "bg-blue-50/70" : ""}`}
                        >
                          {team.logoUrl ? (
                            <Image
                              src={team.logoUrl}
                              alt=""
                              width={28}
                              height={28}
                              className="h-7 w-7 object-contain"
                            />
                          ) : (
                            <span
                              aria-hidden="true"
                              className="flex h-7 w-7 items-center justify-center text-[10px] font-semibold"
                            >
                              {team.abbr ?? team.name.slice(0, 3)}
                            </span>
                          )}
                          <span
                            className={`text-center font-semibold tabular-nums text-slate-800 ${view.usesLegacyTies ? "text-xs" : "text-base"}`}
                          >
                            {team.record}
                          </span>
                          <span className="min-w-0 space-y-1.5">
                            <span className="flex items-baseline justify-between gap-0.5 tabular-nums">
                              <span className="text-xs font-semibold text-slate-800">
                                {rank ? `#${rank.rank}` : "—"}
                              </span>
                              <span
                                title={
                                  movement == null
                                    ? "No previous ranking"
                                    : "Change since previous ranking"
                                }
                                className={`text-[10px] ${movement && movement > 0 ? "text-emerald-700" : movement && movement < 0 ? "text-red-700" : "text-slate-400"}`}
                              >
                                {movement == null
                                  ? ""
                                  : movement > 0
                                    ? `↑${movement}`
                                    : movement < 0
                                      ? `↓${Math.abs(movement)}`
                                      : "–"}
                              </span>
                            </span>
                            <span
                              aria-hidden="true"
                              className="block h-1 overflow-hidden rounded-full bg-slate-100"
                            >
                              {team.scoreWidth !== null ? (
                                <span
                                  className="block h-full rounded-full bg-blue-500"
                                  style={{ width: `${team.scoreWidth}%` }}
                                />
                              ) : null}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
          <p className="mx-auto max-w-sm pt-2 text-[10px] text-slate-500">
            Bars: score relative to league leader
          </p>
          {view.powerStatus ? (
            <p
              role="status"
              className="mx-auto max-w-sm py-1 text-xs text-slate-500"
            >
              {view.powerStatus}
            </p>
          ) : null}
          {selected ? (
            <div className="mx-auto mt-1 max-w-sm border-t border-slate-100 pt-1">
              <Link
                href={selected.href}
                className="flex min-h-11 items-center gap-1 text-xs font-semibold text-slate-800 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500"
                title={`View ${selected.name}`}
              >
                {selected.name}
                <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden="true" />
              </Link>
              <p
                role="status"
                aria-live="polite"
                className="pb-1 text-xs text-slate-500"
              >
                {places[selected.place - 1] ?? selected.place} in{" "}
                {selected.conference} · {selected.record}
                {selected.ranking
                  ? ` · Power #${selected.ranking.rank} · Score ${score == null ? "—" : score.toFixed(1)}${scoreChange == null ? "" : ` (${scoreChange >= 0 ? "+" : ""}${scoreChange.toFixed(1)})`}`
                  : " · No power ranking"}
              </p>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
