"use client";

import { useLockerRoomContextNavigation } from "@gshl-hooks";
import { PageContextNavigation } from "@gshl-nav";
import { LockerRoomSkeleton } from "@gshl-skeletons";
import { cn } from "@gshl-utils";

const sections = [
  ["roster", "Roster"],
  ["salary", "Cap"],
  ["tradeBlock", "Trades"],
  ["history", "Matchups"],
  ["trophy", "Trophies"],
  ["recordbook", "Records"],
  ["draft", "Draft"],
] as const;

export function LockerRoomLayout({ children }: { children: React.ReactNode }) {
  const navigation = useLockerRoomContextNavigation();

  return (
    <div className="font-varela">
      <PageContextNavigation ariaLabel="My Team controls" mobileRows={1}>
        <div className="mx-auto flex max-w-5xl">
          {sections.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={navigation.selectedView === key}
              onClick={() => navigation.selectView(key)}
              className={cn(
                "min-h-9 min-w-0 flex-1 border-t-2 px-0.5 text-[10px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-500 sm:text-xs lg:border-b-2 lg:border-t-0 lg:text-sm",
                navigation.selectedView === key
                  ? "border-slate-950 text-slate-950"
                  : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-950",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </PageContextNavigation>
      <main
        aria-labelledby="locker-room-page-heading"
        className="mx-auto max-w-7xl px-3 pb-4 sm:px-6"
      >
        <div className="flex min-h-9 items-center pt-2">
          <h1
            id="locker-room-page-heading"
            className="text-xs font-semibold text-slate-500"
          >
            My Team
          </h1>
        </div>
        {navigation.isReady ? children : <LockerRoomSkeleton />}
      </main>
    </div>
  );
}
