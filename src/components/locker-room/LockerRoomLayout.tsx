"use client";
import { useLockerRoomContextNavigation } from "@gshl-hooks";
import { PageContextNavigation } from "@gshl-nav";
import { LockerRoomSkeleton } from "@gshl-skeletons";
import { cn } from "@gshl-utils";
const sections = [
  ["overview", "Overview"],
  ["roster", "Roster"],
  ["salary", "Contracts & cap"],
  ["tradeBlock", "Trades"],
  ["history", "History"],
] as const;
const history = [
  ["history", "Matchups"],
  ["trophy", "Trophies"],
  ["recordbook", "Records"],
  ["draft", "Draft picks"],
] as const;
export function LockerRoomLayout({ children }: { children: React.ReactNode }) {
  const navigation = useLockerRoomContextNavigation();
  const isHistory = history.some(([key]) => key === navigation.selectedView);
  return (
    <>
      <PageContextNavigation ariaLabel="My Team sections">
        <div className="no-scrollbar mx-auto flex max-w-6xl overflow-x-auto">
          {sections.map(([key, label]) => {
            const active =
              key === "history" ? isHistory : navigation.selectedView === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => navigation.selectView(key)}
                className={cn(
                  "min-h-11 min-w-max flex-1 border-t-2 px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-500 lg:border-b-2 lg:border-t-0 lg:text-sm",
                  active
                    ? "border-slate-950 bg-slate-100 text-slate-950"
                    : "border-transparent text-slate-600 hover:bg-slate-50",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </PageContextNavigation>
      {isHistory ? (
        <div className="gshl-local-controls">
          <div
            role="group"
            aria-label="Team history views"
            className="no-scrollbar mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3"
          >
            {history.map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={navigation.selectedView === key}
                onClick={() => navigation.selectView(key)}
                className={cn(
                  "min-h-11 shrink-0 border-b-2 px-3 text-xs font-medium focus-visible:ring-2 focus-visible:ring-slate-500",
                  navigation.selectedView === key
                    ? "border-slate-950 text-slate-950"
                    : "border-transparent text-slate-500",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <main aria-labelledby="locker-room-page-heading" className="gshl-page">
        <h1 id="locker-room-page-heading" className="sr-only">
          My Team
        </h1>
        {navigation.isReady ? children : <LockerRoomSkeleton />}
      </main>
    </>
  );
}
