"use client";

import { ClipboardList, UsersRound } from "lucide-react";
import { AuthNavControl } from "@gshl-components/auth";
import {
  useAppPathname,
  useAuthSession,
  useSeasonState,
  useTeams,
} from "@gshl-hooks";
import { LinkNavItem, NavContainer } from "../nav/BaseComponents";
import type { GSHLTeam, LinkNavItem as LinkNavItemType } from "@gshl-types";
import { cn, resolveDraftHubSeason } from "@gshl-utils";

const HOME_ICON =
  "https://qzcw4d2n1l.ufs.sh/f/wTZjIHOpQwiMaxJjw04E3mwF7uVBU48DCS2OnLW9fcI0QiA5";

export function DraftHubNavbar() {
  const { pathname } = useAppPathname();
  const { session } = useAuthSession();
  const { seasons } = useSeasonState();
  const season = resolveDraftHubSeason(seasons);
  const { data: teamRows = [] } = useTeams({
    seasonId: season?.id,
    enabled: Boolean(season?.id),
  });
  const teams = teamRows as GSHLTeam[];
  const ownTeam = teams.find(
    (team) =>
      session?.user.ownerId &&
      String(team.ownerId) === String(session.user.ownerId),
  );
  const items: LinkNavItemType[] = [
    {
      id: "home",
      label: "Home",
      href: "/",
      icon: HOME_ICON,
    },
    {
      id: "draft-board",
      label: "Draft Board",
      href: "/draft",
      icon: <ClipboardList className="h-8 w-8" />,
    },
    ...(ownTeam
      ? [
          {
            id: "my-team",
            label: "My Team",
            href: "/draft/my-team",
            icon: ownTeam.logoUrl ?? undefined,
          },
        ]
      : []),
    {
      id: "other-teams",
      label: "Other Teams",
      href: "/draft/teams",
      icon: <UsersRound className="h-8 w-8" />,
    },
  ];

  return (
    <NavContainer position="bottom" variant="primary">
      <div
        className={cn(
          "fixed bottom-0 z-20 flex h-14 w-full items-center justify-evenly bg-gray-200 text-center shadow-inv",
          "lg:bottom-auto lg:top-0 lg:justify-center lg:gap-8 lg:px-4 lg:py-2 xl:gap-14",
        )}
      >
        {items.map((item) => {
          const isActive =
            item.href === "/draft"
              ? pathname === "/draft"
              : pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(`${item.href}/`));
          return <LinkNavItem key={item.id} {...item} isActive={isActive} />;
        })}
        <div className="fixed right-2 top-2 z-[60] lg:absolute lg:right-4">
          <AuthNavControl />
        </div>
      </div>
    </NavContainer>
  );
}
