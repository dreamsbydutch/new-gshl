import type { StarPlayer, UfaOfferGroupView, UfaOfferView } from "@gshl-types";
import { formatMoney } from "../core/format";
import {
  formatMatchupPlayerName,
  formatMatchupPlayerPositions,
  formatStatValue,
} from "./matchup-details";
import { buildWhatsAppShareMessage } from "./whatsapp-share";

interface MatchupShareTeam {
  name: string | null;
  score: number;
  isWinner: boolean;
}

interface MatchupWhatsAppShareInput {
  awayTeam: MatchupShareTeam;
  homeTeam: MatchupShareTeam;
  isComplete: boolean;
  isTie: boolean;
  seasonLabel: string;
  weekNumber?: string | number | null;
  stars: readonly StarPlayer[];
}

interface TradeBlockWhatsAppListing {
  fullName: string;
  posGroup: string;
  nhlPos: readonly string[];
  nhlTeam: readonly string[];
  capHit: number;
  expiryDate: string | null;
  note: string | null;
  team: {
    name: string;
  };
}

function formatMatchupTeamLine(
  location: "Away" | "Home",
  team: MatchupShareTeam,
  isComplete: boolean,
): string {
  const score = `${team.name ?? `${location} team`} — ${team.score}`;
  return `${location}: ${isComplete && team.isWinner ? `*${score}* 🏆` : score}`;
}

function formatStarLine(star: StarPlayer): string {
  const teamAndPosition = [
    star.team?.abbr ?? star.team?.name,
    formatMatchupPlayerPositions(star),
  ]
    .filter(Boolean)
    .join(" · ");
  const highlights =
    star.posGroup === "G"
      ? [
          `${formatStatValue(star.W)} W`,
          `${formatStatValue(star.SV)} SV`,
          `${formatStatValue(star.SVP, 3)} SV%`,
        ]
      : [
          `${formatStatValue(star.G)} G`,
          `${formatStatValue(star.A)} A`,
          `${formatStatValue(star.P)} P`,
        ];

  return `${star.starRank}. *${formatMatchupPlayerName(star)}*${teamAndPosition ? ` (${teamAndPosition})` : ""} — ${formatStatValue(star.numericRating, 2)} rating · ${highlights.join(" · ")}`;
}

export function buildMatchupWhatsAppShareMessage({
  awayTeam,
  homeTeam,
  isComplete,
  isTie,
  seasonLabel,
  weekNumber,
  stars,
}: MatchupWhatsAppShareInput): string {
  const winner = awayTeam.isWinner
    ? awayTeam
    : homeTeam.isWinner
      ? homeTeam
      : null;
  const status = isComplete
    ? isTie
      ? "FINAL · Tie"
      : winner?.name
        ? `FINAL · ${winner.name} win`
        : "FINAL"
    : "LIVE · Matchup in progress";
  const context = `${seasonLabel}${weekNumber != null ? ` · Week ${weekNumber}` : ""}`;
  const starsHeading = isComplete ? "*Three Stars*" : "*Current Three Stars*";
  const starLines =
    stars.length > 0
      ? stars.map(formatStarLine).join("\n")
      : "No player performances yet.";

  return buildWhatsAppShareMessage({
    title: "GSHL Matchup",
    summary: `${status}\n${context}`,
    lines: [
      formatMatchupTeamLine("Away", awayTeam, isComplete),
      formatMatchupTeamLine("Home", homeTeam, isComplete),
      `${starsHeading}\n${starLines}`,
    ],
  });
}

function formatTorontoDeadline(deadlineAt: number): string | null {
  const date = new Date(deadlineAt);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const month = valueFor("month");
  const day = valueFor("day");
  const year = valueFor("year");
  const hour = valueFor("hour");
  const minute = valueFor("minute");
  const dayPeriod = valueFor("dayPeriod")?.toUpperCase();
  if (!month || !day || !year || !hour || !minute || !dayPeriod) return null;

  return `${month} ${day}, ${year} at ${hour}:${minute} ${dayPeriod} ET`;
}

function formatUfaOfferLine(
  group: UfaOfferGroupView,
  offer: UfaOfferView,
): string {
  const playerName = group.player?.fullName ?? "Unavailable player";
  const yearsLabel = `${offer.years} ${offer.years === 1 ? "year" : "years"}`;
  const oddsLabel = `${Math.round(offer.probability * 1000) / 10}%`;
  const deadlineLabel = formatTorontoDeadline(group.deadlineAt);

  return [
    `*${playerName} — ${offer.franchiseName}*`,
    `${yearsLabel} · ${formatMoney(offer.salary)} per season · ${oddsLabel} odds`,
    deadlineLabel ? `Decision: ${deadlineLabel}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function buildUfaOffersWhatsAppShareMessage(
  groups: readonly UfaOfferGroupView[],
): string {
  const offers = groups.flatMap((group) =>
    group.offers.map((offer) => formatUfaOfferLine(group, offer)),
  );
  const playerCount = groups.length;
  const offerCount = offers.length;

  return buildWhatsAppShareMessage({
    title: "GSHL Contract Offers",
    summary: `${offerCount} pending ${offerCount === 1 ? "offer" : "offers"} across ${playerCount} ${playerCount === 1 ? "player" : "players"}`,
    lines: offers,
  });
}

export function buildTradeBlockWhatsAppShareMessage(
  listings: readonly TradeBlockWhatsAppListing[],
): string {
  const teamCount = new Set(listings.map((listing) => listing.team.name)).size;

  return buildWhatsAppShareMessage({
    title: "GSHL Trade Block",
    summary: `${listings.length} ${listings.length === 1 ? "player" : "players"} available from ${teamCount} ${teamCount === 1 ? "team" : "teams"}`,
    lines: listings.map((listing) =>
      [
        `*${listing.fullName} — ${listing.team.name}*`,
        `${listing.nhlPos.join("/") || listing.posGroup} · ${listing.nhlTeam.join("/") || "FA"}`,
        `Cap hit: ${formatMoney(listing.capHit)} · Through ${listing.expiryDate?.slice(0, 4) ?? "TBD"}`,
        `GM note: ${listing.note ?? "Open to offers."}`,
      ].join("\n"),
    ),
  });
}
