"use client";

import Link from "next/link";
import { ClipboardList, Shield, UsersRound } from "lucide-react";
import {
  PageContextNavigation,
  SecondaryPageToolbar,
  TertiaryPageToolbar,
} from "@gshl-nav";
import {
  useAppPathname,
  useAuthSession,
  useDraftTeamsContextNavigation,
  useSeasonState,
  useTeams,
} from "@gshl-hooks";
import { cn, resolveDraftHubSeason } from "@gshl-utils";
import type { GSHLTeam } from "@gshl-types";
import { DraftHubTeamToggle } from "./DraftHubTeamToggle";

export function DraftHubLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useAppPathname();
  const { session, status: authStatus } = useAuthSession();
  const { seasons } = useSeasonState();
  const season = resolveDraftHubSeason(seasons);
  const { data: teamRows = [], isLoading: teamsLoading } = useTeams({
    seasonId: season?.id,
    enabled: Boolean(season?.id),
  });
  const teams = teamRows as GSHLTeam[];
  const ownTeam = teams.find(
    (team) =>
      session?.user.ownerId &&
      String(team.ownerId) === String(session.user.ownerId),
  );
  const showTeamToggle =
    pathname === "/draft/teams" || pathname.startsWith("/draft/teams/");
  const teamNavigation = useDraftTeamsContextNavigation({
    excludedOwnerId: session?.user.ownerId,
    isLoading: teamsLoading || authStatus === "loading",
    teams,
  });
  const draftLinks = [
    {
      href: teamNavigation.draftHref,
      label: "Draft Board",
      icon: ClipboardList,
      isActive: pathname === "/draft",
    },
    ...(ownTeam
      ? [
          {
            href: teamNavigation.myTeamHref,
            label: "My Draft Team",
            icon: Shield,
            isActive: pathname === "/draft/my-team",
          },
        ]
      : []),
    {
      href: teamNavigation.teamsHref,
      label: "Other Teams",
      icon: UsersRound,
      isActive: showTeamToggle,
    },
  ];

  return (
    <div>
      <PageContextNavigation
        ariaLabel="Draft navigation"
        mobileRows={showTeamToggle ? 2 : 1}
      >
        <SecondaryPageToolbar className="sm:justify-center">
          {draftLinks.map(({ href, label, icon: Icon, isActive }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 motion-reduce:transition-none",
                isActive
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </SecondaryPageToolbar>
        {showTeamToggle ? (
          <TertiaryPageToolbar>
            <DraftHubTeamToggle
              seasonId={season?.id}
              excludedOwnerId={session?.user.ownerId}
              isLoading={teamsLoading || authStatus === "loading"}
              teams={teamNavigation.selectableTeams}
              selectedOwnerId={teamNavigation.selectedOwnerId}
              onSelectOwner={teamNavigation.selectOwner}
            />
          </TertiaryPageToolbar>
        ) : null}
      </PageContextNavigation>
      {!showTeamToggle || teamNavigation.isReady ? children : null}
    </div>
  );
}
