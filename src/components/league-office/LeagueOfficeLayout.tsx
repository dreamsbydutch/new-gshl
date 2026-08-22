"use client";

import { useAuthSession, useLeagueOfficeContextNavigation } from "@gshl-hooks";
import {
  HorizontalToggle,
  PageContextNavigation,
  SecondaryPageToolbar,
} from "@gshl-nav";
import type { ToggleItem } from "@gshl-types";
import { LeagueOfficeSkeleton } from "@gshl-skeletons";

export function LeagueOfficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigation = useLeagueOfficeContextNavigation();
  const { session } = useAuthSession();
  const selectedType = navigation.selectedView;
  const isMockDraftPage = navigation.isMockDraftPage;

  const selectView = (type: string | null) => {
    const nextType = type ?? "draft";
    if (
      nextType === "mockDraft" ||
      nextType === "draft" ||
      nextType === "tradeBlock" ||
      nextType === "freeAgents" ||
      nextType === "rules" ||
      nextType === "confBattle" ||
      nextType === "ownerRankings" ||
      nextType === "contracts" ||
      nextType === "users" ||
      nextType === "jobs" ||
      nextType === "newsroom" ||
      nextType === "imageUpload"
    ) {
      navigation.selectView(nextType);
    }
  };

  const pageToolbarProps: {
    toolbarKeys: ToggleItem<string | null>[];
    activeKey: string | null;
  } = {
    activeKey: isMockDraftPage ? "mockDraft" : selectedType,
    toolbarKeys: [
      {
        key: "mockDraft",
        value: "Mock",
        setter: selectView,
      },
      {
        key: "draft",
        value: "Classes",
        setter: selectView,
      },
      {
        key: "tradeBlock",
        value: "Trade",
        setter: selectView,
      },
      {
        key: "freeAgents",
        value: "UFA",
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
        value: "Owners",
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
              value: "Users",
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
              value: "Images",
              setter: selectView,
            },
          ]
        : []),
    ],
  };

  return (
    <div className="font-varela">
      <PageContextNavigation ariaLabel="League Office views">
        <SecondaryPageToolbar>
          <HorizontalToggle<ToggleItem<string | null>>
            items={pageToolbarProps.toolbarKeys}
            selectedItem={
              pageToolbarProps.toolbarKeys.find(
                (item) => item.key === pageToolbarProps.activeKey,
              ) ?? null
            }
            onSelect={(type: ToggleItem<string | null>) =>
              type.setter(type.key)
            }
            getItemKey={(type: ToggleItem<string | null>) => type.key}
            getItemLabel={(type: ToggleItem<string | null>) => type.value}
            itemClassName="text-nowrap text-sm"
          />
        </SecondaryPageToolbar>
      </PageContextNavigation>
      <main aria-labelledby="league-office-page-heading">
        <h1 id="league-office-page-heading" className="sr-only">
          League Office
        </h1>
        {navigation.isReady ? children : <LeagueOfficeSkeleton />}
      </main>
    </div>
  );
}
