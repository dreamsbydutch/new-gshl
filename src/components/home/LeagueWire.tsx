"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  BadgeDollarSign,
  BarChart3,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Gavel,
  Megaphone,
  Newspaper,
  Star,
  Trophy,
  UserPlus,
} from "lucide-react";

import { WhatsAppShareButton } from "@gshl-components/ui/WhatsAppShareButton";
import { useAuthSession } from "@gshl-hooks";
import {
  useLeagueWire,
  useLeagueWirePublisher,
} from "@gshl-hooks/main/useLeagueWire";
import { useTeams } from "@gshl-hooks/main/useTeam";
import type { GSHLTeam } from "@gshl-lib/types/database";
import type {
  LeagueWirePost,
  LeagueWirePostKind,
} from "@gshl-lib/types/league-wire";
import { LeagueWireRowsSkeleton } from "@gshl-skeletons";
import { Button, Input, Select } from "@gshl-ui";
import { cn, showDate } from "@gshl-utils";
import {
  LEAGUE_WIRE_PREVIEW_LIMIT,
  LEAGUE_WIRE_QUERY_LIMIT,
  parseLeagueWireAssetLines,
  selectLeagueWirePosts,
} from "@gshl-utils/features/league-wire";
import { buildWhatsAppShareMessage } from "@gshl-utils/features/whatsapp-share";
import { canShareOwnerContent } from "@gshl-utils/features/whatsapp-share";

const POST_META: Record<
  LeagueWirePostKind,
  {
    label: string;
    icon: typeof ArrowLeftRight;
    badge: string;
  }
> = {
  trade: {
    label: "Trade",
    icon: ArrowLeftRight,
    badge: "bg-blue-50 text-blue-700 ring-blue-200",
  },
  trade_block: {
    label: "Trade block",
    icon: ClipboardList,
    badge: "bg-sky-50 text-sky-700 ring-sky-200",
  },
  draft_pick: {
    label: "Draft pick",
    icon: Trophy,
    badge: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  },
  ufa_offer: {
    label: "UFA offer",
    icon: BadgeDollarSign,
    badge: "bg-violet-50 text-violet-700 ring-violet-200",
  },
  ufa_result: {
    label: "UFA result",
    icon: Gavel,
    badge: "bg-purple-50 text-purple-700 ring-purple-200",
  },
  add: {
    label: "Add",
    icon: UserPlus,
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  drop: {
    label: "Drop",
    icon: ArrowDownToLine,
    badge: "bg-rose-50 text-rose-700 ring-rose-200",
  },
  missed_start: {
    label: "Missed start",
    icon: AlertTriangle,
    badge: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  matchup_final: {
    label: "Final",
    icon: Trophy,
    badge: "bg-slate-100 text-slate-700 ring-slate-200",
  },
  three_stars: {
    label: "Three stars",
    icon: Star,
    badge: "bg-yellow-50 text-yellow-800 ring-yellow-200",
  },
  power_ranking: {
    label: "Power",
    icon: BarChart3,
    badge: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  },
  press_box: {
    label: "Newsletter",
    icon: Newspaper,
    badge: "bg-neutral-100 text-neutral-700 ring-neutral-200",
  },
  announcement: {
    label: "League",
    icon: Megaphone,
    badge: "bg-red-50 text-red-700 ring-red-200",
  },
};

function isGshlTeam(team: unknown): team is GSHLTeam {
  return Boolean(
    team &&
      typeof team === "object" &&
      "franchiseId" in team &&
      "ownerId" in team &&
      "name" in team,
  );
}

function postShareMessage(post: LeagueWirePost) {
  const tradeLines =
    post.tradePackages?.flatMap((tradePackage) => [
      `${tradePackage.teamName} receives:`,
      ...tradePackage.assets.map((asset) => `- ${asset.label}`),
    ]) ?? [];
  return buildWhatsAppShareMessage({
    title: `GSHL ${POST_META[post.kind].label}`,
    summary: post.title,
    lines: [post.summary, post.body, ...tradeLines].filter(
      (line): line is string => Boolean(line),
    ),
  });
}

function TradePackages({ post }: { post: LeagueWirePost }) {
  if (!post.tradePackages?.length) return null;
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {post.tradePackages.map((tradePackage) => (
        <section
          key={tradePackage.teamId}
          aria-label={`${tradePackage.teamName} receives`}
          className="border-l-2 border-slate-200 pl-3"
        >
          <h4 className="text-xs font-semibold text-slate-800">
            {tradePackage.teamName} receives
          </h4>
          <ul className="mt-1 space-y-0.5 text-xs leading-5 text-slate-600">
            {tradePackage.assets.map((asset, index) => (
              <li key={`${asset.label}-${index}`}>{asset.label}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function LeagueWireComposer({ seasonId }: { seasonId: string }) {
  const { session } = useAuthSession();
  const [isOpen, setIsOpen] = useState(false);
  const [postType, setPostType] = useState<"announcement" | "trade">(
    "announcement",
  );
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkHref, setLinkHref] = useState("");
  const [firstTeamId, setFirstTeamId] = useState("");
  const [secondTeamId, setSecondTeamId] = useState("");
  const [firstAssets, setFirstAssets] = useState("");
  const [secondAssets, setSecondAssets] = useState("");
  const [tradeSummary, setTradeSummary] = useState("");
  const [proposalHref, setProposalHref] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const wire = useLeagueWirePublisher();
  const teamsQuery = useTeams({
    seasonId,
    enabled: session?.user.role === "commissioner" && isOpen,
  });
  const teams = useMemo(
    () =>
      teamsQuery.data
        .filter(isGshlTeam)
        .filter((team) => team.name)
        .sort((left, right) =>
          String(left.name).localeCompare(String(right.name)),
        ),
    [teamsQuery.data],
  );

  useEffect(() => {
    if (!firstTeamId) setFirstTeamId(teams[0]?.id ?? "");
    if (!secondTeamId) setSecondTeamId(teams[1]?.id ?? "");
  }, [firstTeamId, secondTeamId, teams]);

  if (session?.user.role !== "commissioner") return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    try {
      if (postType === "announcement") {
        await wire.publishAnnouncement.mutateAsync({
          seasonId,
          title,
          body,
          linkLabel,
          linkHref,
        });
        setTitle("");
        setBody("");
        setLinkLabel("");
        setLinkHref("");
      } else {
        await wire.publishTrade.mutateAsync({
          seasonId,
          firstTeamId,
          firstAssets: parseLeagueWireAssetLines(firstAssets),
          secondTeamId,
          secondAssets: parseLeagueWireAssetLines(secondAssets),
          summary: tradeSummary || undefined,
          proposalHref: proposalHref || undefined,
        });
        setFirstAssets("");
        setSecondAssets("");
        setTradeSummary("");
        setProposalHref("");
      }
      setMessage("Posted to the League Wire.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Post failed.");
    }
  };

  const isPending =
    wire.publishAnnouncement.isPending || wire.publishTrade.isPending;

  return (
    <div className="border-b border-slate-100 px-3 py-2 sm:px-5">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Megaphone className="h-3.5 w-3.5" aria-hidden="true" />
        {isOpen ? "Close composer" : "Post to wire"}
      </button>
      {isOpen ? (
        <form onSubmit={submit} className="grid gap-3 pb-2 pt-2">
          <label className="text-xs font-medium text-slate-600">
            Post type
            <Select
              value={postType}
              onValueChange={(value) =>
                setPostType(value === "trade" ? "trade" : "announcement")
              }
              className="mt-1"
            >
              <option value="announcement">Announcement</option>
              <option value="trade">Completed trade</option>
            </Select>
          </label>

          {postType === "announcement" ? (
            <>
              <label className="text-xs font-medium text-slate-600">
                Headline
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={120}
                  required
                  className="mt-1"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Announcement
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={2000}
                  required
                  rows={3}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-600">
                  Link label
                  <Input
                    value={linkLabel}
                    onChange={(event) => setLinkLabel(event.target.value)}
                    required
                    className="mt-1"
                  />
                </label>
                <label className="text-xs font-medium text-slate-600">
                  Link path or URL
                  <Input
                    value={linkHref}
                    onChange={(event) => setLinkHref(event.target.value)}
                    placeholder="/schedule or https://…"
                    required
                    className="mt-1"
                  />
                </label>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    label: "First team receives",
                    teamId: firstTeamId,
                    setTeamId: setFirstTeamId,
                    assets: firstAssets,
                    setAssets: setFirstAssets,
                  },
                  {
                    label: "Second team receives",
                    teamId: secondTeamId,
                    setTeamId: setSecondTeamId,
                    assets: secondAssets,
                    setAssets: setSecondAssets,
                  },
                ].map((side) => (
                  <fieldset key={side.label} className="space-y-2">
                    <legend className="text-xs font-semibold text-slate-700">
                      {side.label}
                    </legend>
                    <Select
                      aria-label={`${side.label} team`}
                      value={side.teamId}
                      onValueChange={side.setTeamId}
                    >
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </Select>
                    <textarea
                      aria-label={`${side.label} assets`}
                      value={side.assets}
                      onChange={(event) => side.setAssets(event.target.value)}
                      placeholder="One player, pick, or asset per line"
                      required
                      rows={4}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </fieldset>
                ))}
              </div>
              <label className="text-xs font-medium text-slate-600">
                Trade note (optional)
                <Input
                  value={tradeSummary}
                  onChange={(event) => setTradeSummary(event.target.value)}
                  maxLength={320}
                  className="mt-1"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Proposal path or URL (optional)
                <Input
                  value={proposalHref}
                  onChange={(event) => setProposalHref(event.target.value)}
                  placeholder="/leagueoffice/… or https://…"
                  className="mt-1"
                />
              </label>
            </>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Posting…" : "Publish"}
            </Button>
            {message ? (
              <p className="text-xs text-slate-600" role="status">
                {message}
              </p>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function LeagueWire({ seasonId }: { seasonId?: string }) {
  const [showAll, setShowAll] = useState(false);
  const { session } = useAuthSession();
  const {
    data: posts,
    isLoading,
    error,
  } = useLeagueWire(seasonId, LEAGUE_WIRE_QUERY_LIMIT);
  const visiblePosts = selectLeagueWirePosts(posts, showAll);
  const hiddenCount = Math.max(0, posts.length - LEAGUE_WIRE_PREVIEW_LIMIT);
  const canShare = canShareOwnerContent(session?.user.role);

  return (
    <section
      aria-labelledby="league-wire-heading"
      className="h-full min-w-0 overflow-hidden border-y border-slate-300 bg-white sm:rounded-lg sm:border"
    >
      <header className="border-b border-slate-800 bg-slate-950 px-4 py-4 text-white sm:px-6 sm:py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="league-wire-heading"
              className="font-oswald text-2xl leading-none sm:text-3xl"
            >
              League Wire
            </h2>
            <p className="mt-1.5 text-xs text-slate-300 sm:text-sm">
              Rankings, weekly stars, deals and league stories
            </p>
          </div>
          <ArrowUpFromLine
            className="mt-0.5 h-6 w-6 text-slate-500"
            aria-hidden="true"
          />
        </div>
      </header>

      {seasonId ? <LeagueWireComposer seasonId={seasonId} /> : null}

      {isLoading ? (
        <LeagueWireRowsSkeleton />
      ) : error ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500 sm:px-5">
          The League Wire is unavailable right now.
        </p>
      ) : posts.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500 sm:px-5">
          Nothing has been posted for this season.
        </p>
      ) : (
        <div id="home-league-wire-list" className="divide-y divide-slate-100">
          {visiblePosts.map((post, index) => {
            const meta = POST_META[post.kind];
            const Icon = meta.icon;
            const primaryTeam = post.teams[0];
            const isLeadStory = index === 0;
            const sharePath =
              post.links.find((link) => link.href.startsWith("/"))?.href ?? "/";
            return (
              <article
                key={post.id}
                id={`league-wire-post-${post.id}`}
                className={cn(
                  "scroll-mt-32",
                  isLeadStory
                    ? "bg-slate-50 px-4 py-5 sm:px-6 sm:py-6"
                    : "px-3 py-3 sm:px-5",
                )}
              >
                <div
                  className={cn(
                    "flex min-w-0 items-start",
                    isLeadStory ? "gap-4" : "gap-3",
                  )}
                >
                  <div
                    className={cn(
                      "flex shrink-0 items-center justify-center",
                      isLeadStory ? "h-12 w-12 sm:h-14 sm:w-14" : "h-10 w-10",
                    )}
                  >
                    {primaryTeam?.logoUrl ? (
                      <Image
                        src={primaryTeam.logoUrl}
                        alt=""
                        width={56}
                        height={56}
                        className={cn(
                          "object-contain",
                          isLeadStory
                            ? "h-12 w-12 sm:h-14 sm:w-14"
                            : "h-10 w-10",
                        )}
                      />
                    ) : (
                      <Icon
                        className={cn(
                          "text-slate-400",
                          isLeadStory ? "h-7 w-7" : "h-5 w-5",
                        )}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset",
                          meta.badge,
                        )}
                      >
                        <Icon className="h-3 w-3" aria-hidden="true" />
                        {meta.label}
                      </span>
                      <time
                        dateTime={post.occurredAt}
                        className="text-xs tabular-nums text-slate-400"
                      >
                        {showDate(post.occurredAt)}
                      </time>
                    </div>
                    <h3
                      className={cn(
                        "mt-1 font-semibold text-slate-950",
                        isLeadStory
                          ? "text-base leading-6 sm:text-xl sm:leading-7"
                          : "text-sm leading-5",
                      )}
                    >
                      {post.title}
                    </h3>
                    {post.summary ? (
                      <p
                        className={cn(
                          "text-slate-600",
                          isLeadStory
                            ? "mt-1 text-sm leading-5 sm:text-base sm:leading-6"
                            : "mt-0.5 text-xs leading-5",
                        )}
                      >
                        {post.summary}
                      </p>
                    ) : null}
                    {post.body ? (
                      <p
                        className={cn(
                          "mt-2 whitespace-pre-line text-slate-700",
                          isLeadStory
                            ? "text-sm leading-6 sm:text-base"
                            : "text-sm leading-5",
                        )}
                      >
                        {post.body}
                      </p>
                    ) : null}
                    <TradePackages post={post} />
                    {post.links.length || canShare ? (
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                        {post.links.map((link) => (
                          <Link
                            key={`${link.label}:${link.href}`}
                            href={link.href}
                            className="inline-flex min-h-9 items-center text-xs font-semibold text-blue-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          >
                            {link.label}
                          </Link>
                        ))}
                        {canShare ? (
                          <WhatsAppShareButton
                            message={postShareMessage(post)}
                            path={sharePath}
                            label="Share"
                            ariaLabel={`Share ${post.title} to WhatsApp`}
                            className="ml-auto shrink-0"
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!isLoading && !error && hiddenCount > 0 ? (
        <footer className="border-t border-slate-100 px-3 py-2 sm:px-5">
          <button
            type="button"
            aria-controls="home-league-wire-list"
            aria-expanded={showAll}
            onClick={() => setShowAll((expanded) => !expanded)}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {showAll ? (
              <>
                Show fewer
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              </>
            ) : (
              <>
                Show {hiddenCount} more
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </button>
        </footer>
      ) : null}
    </section>
  );
}
