"use client";
/* eslint-disable @next/next/no-img-element */

import {
  AWARD_CATALOG_BY_KEY,
  getAwardLabel,
  getAwardTeamId,
  getPlayerAwardPlayerId,
} from "@gshl-lib/config/awards";
import type { AwardsShowcaseProps, PlayerAward } from "@gshl-types";

function AwardImage({
  award,
  alt,
}: {
  award: PlayerAward["award"];
  alt: string;
}) {
  const imageUrl = AWARD_CATALOG_BY_KEY.get(award)?.imageUrl;
  return imageUrl ? (
    <img
      className="h-20 w-20 shrink-0 object-contain"
      src={imageUrl}
      alt={alt}
    />
  ) : (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-muted text-center text-[10px] uppercase text-muted-foreground">
      GSHL
    </div>
  );
}

export function AwardsShowcase({
  playerAwards,
  teamAwards,
  players,
  teams,
}: AwardsShowcaseProps) {
  const playerById = new Map(
    players.map((player) => [String(player.id), player]),
  );
  const teamById = new Map(teams.map((team) => [String(team.id), team]));
  const orderedTeamAwards = [...teamAwards].sort((a, b) =>
    getAwardLabel(a.award).localeCompare(getAwardLabel(b.award)),
  );
  const orderedPlayerAwards = [...playerAwards].sort((a, b) =>
    getAwardLabel(a.award).localeCompare(getAwardLabel(b.award)),
  );

  if (!orderedTeamAwards.length && !orderedPlayerAwards.length) {
    return (
      <p className="px-6 py-16 text-center text-sm text-muted-foreground">
        No awards have been recorded for this season.
      </p>
    );
  }

  return (
    <section className="mx-auto max-w-6xl space-y-12 px-4 pb-10">
      <AwardGroup title="Team Awards">
        {orderedTeamAwards.map((award) => {
          const label = getAwardLabel(award.award);
          const teamId = getAwardTeamId(award, teams);
          const team = teamById.get(teamId);
          return (
            <AwardCard
              key={award.id}
              image={<AwardImage award={award.award} alt={label} />}
              title={label}
            >
              <div className="flex items-center justify-center gap-2">
                {team?.logoUrl && (
                  <img
                    src={team.logoUrl}
                    alt=""
                    className="h-8 w-8 rounded-md object-cover"
                  />
                )}
                <span>{team?.name ?? `Team ${teamId}`}</span>
              </div>
            </AwardCard>
          );
        })}
      </AwardGroup>
      <AwardGroup title="Player Awards">
        {orderedPlayerAwards.map((award) => {
          const label = getAwardLabel(award.award);
          const playerId = getPlayerAwardPlayerId(award);
          const player = playerById.get(playerId);
          const team = teamById.get(getAwardTeamId(award));
          return (
            <AwardCard
              key={award.id}
              image={<AwardImage award={award.award} alt={label} />}
              title={label}
            >
              <p>{player?.fullName ?? `Player ${playerId}`}</p>
              <p className="text-xs font-normal text-muted-foreground">
                {team?.name ?? "Team unavailable"}
              </p>
            </AwardCard>
          );
        })}
      </AwardGroup>
    </section>
  );
}

function AwardGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children)
    ? children.length > 0
    : Boolean(children);
  if (!hasChildren) return null;
  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <div className="h-px flex-1 bg-border" />
        <h2 className="font-barlow text-sm uppercase tracking-[0.25em] text-muted-foreground">
          {title}
        </h2>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </div>
  );
}

function AwardCard({
  image,
  title,
  children,
}: {
  image: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="flex items-center gap-4 rounded-2xl border bg-white p-4 text-center shadow-sm">
      {image}
      <div className="min-w-0 flex-1">
        <h3 className="font-oswald text-xl leading-tight">{title}</h3>
        <div className="mt-2 font-semibold">{children}</div>
      </div>
    </article>
  );
}
