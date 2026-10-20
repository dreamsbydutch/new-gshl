"use client";

import Link from "next/link";
import { ClipboardList, Shield, UsersRound } from "lucide-react";
import { SecondaryPageToolbar, TertiaryPageToolbar } from "@gshl-nav";
import { useDraftHubNavigation } from "@gshl-hooks/features/useDraftHubNavigation";
import { SectionNavigation } from "@gshl-components/nav/SectionNavigation";
import { cn } from "@gshl-utils";
import { DraftHubTeamToggle } from "./DraftHubTeamToggle";
import { DraftModeControl } from "./DraftModeControl";

export function DraftHubLayout({ children }: { children: React.ReactNode }) {
  const navigation = useDraftHubNavigation();
  const showTeamToggle = navigation.isTeamsPage;
  const icons = { board: ClipboardList, mine: Shield, teams: UsersRound };

  return (
    <div>
      <SectionNavigation section="players" />
      <div
        className="gshl-local-controls"
        role="group"
        aria-label="Draft navigation"
      >
        <SecondaryPageToolbar className="sm:justify-center">
          {navigation.links.map(({ href, label, kind, isActive }) => {
            const Icon = icons[kind];
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-11 shrink-0 items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 motion-reduce:transition-none",
                  isActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{label}</span>
              </Link>
            );
          })}
        </SecondaryPageToolbar>
        {showTeamToggle ? (
          <TertiaryPageToolbar>
            <DraftHubTeamToggle
              isLoading={navigation.isLoading}
              teams={navigation.selectableTeams}
              selectedTeam={navigation.selectedTeam}
              onSelectOwner={navigation.selectOwner}
            />
          </TertiaryPageToolbar>
        ) : null}
      </div>
      <div className="mx-auto max-w-6xl px-3 py-2 sm:px-5">
        <DraftModeControl seasonId={navigation.season?.id} />
      </div>
      {!showTeamToggle || navigation.isReady ? children : null}
    </div>
  );
}
