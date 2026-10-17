"use client";

import Link from "next/link";
import {
  useAppPathname,
  useAppSearchParams,
  useSeasonState,
} from "@gshl-hooks";
import { cn } from "@gshl-utils";
import { getSectionNavigation } from "@gshl-utils/features/section-navigation";
import { PageContextNavigation } from "./PageContextNavigation";

/** Section destinations stay within thumb reach; local filters belong above content. */
export function SectionNavigation({
  section,
}: {
  section: "league" | "players";
}) {
  const { pathname } = useAppPathname();
  const { search } = useAppSearchParams();
  const { selectedSeasonId } = useSeasonState({ autoSelect: false });
  const items = getSectionNavigation(
    section,
    pathname,
    search,
    selectedSeasonId,
  );

  return (
    <PageContextNavigation
      ariaLabel={`${section === "league" ? "League" : "Players"} sections`}
    >
      <div className="no-scrollbar mx-auto flex max-w-6xl overflow-x-auto">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            aria-current={item.active ? "page" : undefined}
            className={cn(
              "flex min-h-11 min-w-max flex-1 items-center justify-center border-t-2 px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-500 lg:border-b-2 lg:border-t-0 lg:text-sm",
              item.active
                ? "border-slate-950 bg-slate-100 text-slate-950"
                : "border-transparent text-slate-600 hover:bg-slate-50",
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </PageContextNavigation>
  );
}
