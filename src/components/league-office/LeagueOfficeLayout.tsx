"use client";

import {
  useAppPathname,
  useAppRouter,
  useAuthSession,
  useLeagueOfficeNavigation,
} from "@gshl-hooks";
import { HorizontalToggle, SecondaryPageToolbar } from "@gshl-nav";
import type { ToggleItem } from "@gshl-types";
import { useEffect } from "react";

export function LeagueOfficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { selectedType, setSelectedType } = useLeagueOfficeNavigation();
  const { session } = useAuthSession();
  const { pathname } = useAppPathname();
  const { router } = useAppRouter();
  const isMockDraftPage = pathname === "/leagueoffice/mock-draft";

  useEffect(() => {
    if (isMockDraftPage) {
      setSelectedType("mockDraft");
      return;
    }

    const view = new URLSearchParams(window.location.search).get("view");
    if (view === "freeAgents") {
      setSelectedType("freeAgents");
    }
  }, [isMockDraftPage, setSelectedType]);

  const selectView = (type: string | null) => {
    const nextType = type ?? "";
    setSelectedType(nextType);
    router.push(
      nextType === "mockDraft" ? "/leagueoffice/mock-draft" : "/leagueoffice",
    );
  };

  const pageToolbarProps: {
    toolbarKeys: ToggleItem<string | null>[];
    activeKey: string | null;
    className?: [string?, string?, string?];
  } = {
    className: ["bottom-24 h-8", "h-6", "text-xs"],
    activeKey: isMockDraftPage ? "mockDraft" : selectedType,
    toolbarKeys: [
      {
        key: "mockDraft",
        value: "Mock Draft",
        setter: selectView,
      },
      {
        key: "draft",
        value: "Draft Classes",
        setter: selectView,
      },
      {
        key: "freeAgents",
        value: "Free Agents",
        setter: selectView,
      },
      {
        key: "rules",
        value: "Rulebook",
        setter: selectView,
      },
      {
        key: "confBattle",
        value: "Conf v Conf",
        setter: selectView,
      },
      {
        key: "ownerRankings",
        value: "Owner Ladder",
        setter: selectView,
      },
      ...(session?.user.role === "commissioner"
        ? [
            {
              key: "contracts",
              value: "Contracts",
              setter: selectView,
            },
            {
              key: "users",
              value: "User Access",
              setter: selectView,
            },
            {
              key: "jobs",
              value: "Jobs",
              setter: selectView,
            },
            {
              key: "newsroom",
              value: "Newsroom",
              setter: selectView,
            },
            {
              key: "imageUpload",
              value: "Image Upload",
              setter: selectView,
            },
          ]
        : []),
    ],
  };

  return (
    <div className="pb-24 font-varela lg:pb-8 lg:pt-12">
      {children}
      <SecondaryPageToolbar>
        <HorizontalToggle<ToggleItem<string | null>>
          items={pageToolbarProps.toolbarKeys}
          selectedItem={
            pageToolbarProps.toolbarKeys.find(
              (item) => item.key === pageToolbarProps.activeKey,
            ) ?? null
          }
          onSelect={(type: ToggleItem<string | null>) => type.setter(type.key)}
          getItemKey={(type: ToggleItem<string | null>) => type.key}
          getItemLabel={(type: ToggleItem<string | null>) => type.value}
          itemClassName="text-sm text-nowrap"
          className="no-scrollbar flex flex-row overflow-scroll"
        />
      </SecondaryPageToolbar>
    </div>
  );
}
