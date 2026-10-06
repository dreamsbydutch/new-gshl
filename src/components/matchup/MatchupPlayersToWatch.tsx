"use client";

import Image from "next/image";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import type { MatchupDetailsPayload, MatchupDetailsTeam } from "@gshl-types";
import { useMatchupPlayersToWatch } from "@gshl-hooks/features/useMatchupPlayersToWatch";
import { useMatchupPreviewArticles } from "@gshl-hooks/main/useMatchupPreviewArticles";
import type { MatchupPreviewArticle } from "@gshl-lib/types/matchup-preview-article";

function TeamPlayers({ teamId }: { teamId: string }) {
  const preview = useMatchupPlayersToWatch(teamId);
  return (
    <>
      {preview.isLoading ? (
        <p role="status" className="text-xs text-slate-600">
          Loading players…
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {preview.players.length === 0 ? (
            <li className="py-2 text-xs text-slate-600">
              No ranked players available.
            </li>
          ) : null}
          {preview.players.map((player, index) => (
            <li
              key={player.id}
              className="flex min-h-12 items-center gap-2 py-1.5 text-xs"
            >
              <span className="w-4 shrink-0 text-slate-600">{index + 1}</span>
              <NHLLogo
                team={{ name: player.nhlTeam, logoUrl: "" }}
                size={22}
                className="!mx-0 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div
                  className="truncate font-semibold text-slate-900"
                  title={player.fullName}
                >
                  {player.fullName}
                </div>
                <div className="truncate text-slate-600">
                  {player.nhlPos.join(" / ")}
                  {player.lineupPos === "IR" || player.lineupPos === "IRplus"
                    ? " · Injured reserve"
                    : ""}
                </div>
              </div>
              <span className="shrink-0 text-right tabular-nums text-slate-700">
                <span className="block font-semibold">#{player.overallRk}</span>
                <span className="block text-[10px]">Overall</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function TeamPreview({
  team,
  teamId,
  article,
  previewOnly,
}: {
  team: MatchupDetailsTeam | null;
  teamId: string;
  article?: MatchupPreviewArticle;
  previewOnly: boolean;
}) {
  return (
    <div className="min-w-0 p-3">
      <h3 className="mb-2 flex items-center gap-2 font-semibold text-slate-900">
        {team?.logoUrl ? (
          <Image
            src={team.logoUrl}
            alt=""
            width={24}
            height={24}
            className="h-6 w-6 object-contain"
          />
        ) : null}
        <span className="truncate">{team?.name ?? "Team"}</span>
      </h3>
      {!previewOnly ? <TeamPlayers teamId={teamId} /> : null}
      {article ? (
        <article className="mt-3 border-t border-slate-200 pt-3">
          <h4 className="font-oswald text-lg leading-tight text-slate-900">
            {article.headline}
          </h4>
          <p className="mt-1 text-xs text-slate-600">
            By {article.writer} · Team beat writer
          </p>
          <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-800">
            {article.paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </article>
      ) : null}
    </div>
  );
}

export function MatchupPlayersToWatch({
  details,
  previewOnly = false,
}: {
  details: MatchupDetailsPayload;
  previewOnly?: boolean;
}) {
  const articles = useMatchupPreviewArticles(details.matchup.id);
  if (previewOnly && articles.length === 0) return null;
  const headingId = previewOnly
    ? "matchup-previews-heading"
    : "players-to-watch-heading";
  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm sm:rounded-2xl"
    >
      <div className="border-b border-slate-200 px-3 py-2">
        <h2 id={headingId} className="font-oswald text-lg text-slate-900">
          {previewOnly ? "Matchup Previews" : "Players to Watch"}
        </h2>
        <p className="text-xs text-slate-600">
          {previewOnly
            ? "Pregame analysis and predictions from each team's beat writer."
            : "Top three players on each current roster, by overall rank."}
        </p>
      </div>
      <div className="grid divide-y divide-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <TeamPreview
          team={details.teams.away}
          teamId={details.matchup.awayTeamId}
          previewOnly={previewOnly}
          article={articles.find(
            (article) => article.teamId === details.matchup.awayTeamId,
          )}
        />
        <TeamPreview
          team={details.teams.home}
          teamId={details.matchup.homeTeamId}
          previewOnly={previewOnly}
          article={articles.find(
            (article) => article.teamId === details.matchup.homeTeamId,
          )}
        />
      </div>
    </section>
  );
}
