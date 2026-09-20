"use client";

import { useAdminContextNavigation } from "@gshl-hooks";
import {
  HorizontalToggle,
  PageContextNavigation,
  SecondaryPageToolbar,
} from "@gshl-nav";
import { AdminPanelSkeleton } from "@gshl-skeletons";
import type { AdminNavigationView, ToggleItem } from "@gshl-types";

const ADMIN_TABS: ReadonlyArray<{
  key: AdminNavigationView;
  label: string;
}> = [
  { key: "contracts", label: "Contracts" },
  { key: "draftPicks", label: "Draft Picks" },
  { key: "users", label: "Users" },
  { key: "jobs", label: "Jobs" },
  { key: "newsroom", label: "Newsroom" },
  { key: "images", label: "Images" },
  { key: "tv", label: "TV Displays" },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const navigation = useAdminContextNavigation();
  const toolbarKeys: ToggleItem<AdminNavigationView>[] = ADMIN_TABS.map(
    ({ key, label }) => ({
      key,
      value: label,
      data: key,
      setter: navigation.selectView,
    }),
  );

  return (
    <div className="font-varela">
      <PageContextNavigation ariaLabel="Administration views">
        <SecondaryPageToolbar>
          <HorizontalToggle<ToggleItem<AdminNavigationView>>
            items={toolbarKeys}
            selectedItem={
              toolbarKeys.find(
                (item) => item.key === navigation.selectedView,
              ) ?? null
            }
            onSelect={(item) => {
              if (item.data) item.setter(item.data);
            }}
            getItemKey={(item) => item.key}
            getItemLabel={(item) => item.value}
            itemClassName="text-nowrap text-sm"
          />
        </SecondaryPageToolbar>
      </PageContextNavigation>
      <main aria-labelledby="admin-page-heading">
        <h1 id="admin-page-heading" className="sr-only">
          Administration
        </h1>
        {navigation.isReady ? children : <AdminPanelSkeleton />}
      </main>
    </div>
  );
}
