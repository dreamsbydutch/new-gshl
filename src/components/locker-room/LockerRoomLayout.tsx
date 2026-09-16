"use client";

import { useRef } from "react";
import { ChevronDown } from "lucide-react";
import { useLockerRoomContextNavigation } from "@gshl-hooks";
import { PageContextNavigation, TeamsToggle } from "@gshl-nav";
import { LockerRoomSkeleton } from "@gshl-skeletons";
import { cn } from "@gshl-utils";

const sections = [
  ["roster", "Roster"],
  ["salary", "Cap"],
  ["history", "Matchups"],
  ["trophy", "Trophies"],
  ["recordbook", "Records"],
  ["draft", "Draft"],
] as const;

export function LockerRoomLayout({ children }: { children: React.ReactNode }) {
  const navigation = useLockerRoomContextNavigation();
  const teamPickerRef = useRef<HTMLDetailsElement>(null);

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
                "min-h-9 min-w-0 flex-1 border-t-2 px-1 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-500 sm:text-xs lg:border-b-2 lg:border-t-0 lg:text-sm",
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
        <div className="flex items-center justify-between gap-3 pt-2">
          <h1
            id="locker-room-page-heading"
            className="text-xs font-semibold text-slate-500"
          >
            My Team
          </h1>
          <details ref={teamPickerRef} className="group relative">
            <summary className="flex min-h-9 cursor-pointer items-center gap-2 text-xs font-medium text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500">
              Change team{" "}
              <ChevronDown
                aria-hidden="true"
                className="h-3 w-3 group-open:rotate-180"
              />
            </summary>
            <div className="absolute right-0 z-30 w-[min(22rem,calc(100vw-1.5rem))] rounded-md border border-slate-200 bg-white p-2 shadow-md">
              <TeamsToggle
                seasonId={navigation.selectedSeasonId}
                selectedOwnerId={navigation.selectedOwnerId}
                onSelectOwner={(ownerId) => {
                  navigation.selectOwner(ownerId);
                  teamPickerRef.current?.removeAttribute("open");
                  teamPickerRef.current?.querySelector("summary")?.focus();
                }}
              />
            </div>
          </details>
        </div>
        {navigation.isReady ? children : <LockerRoomSkeleton />}
      </main>
    </div>
  );
}
