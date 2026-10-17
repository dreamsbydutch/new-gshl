"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useUfaOverview } from "@gshl-hooks/features/useUfaData";
/** A league event entry; personal offers stay on My Team. */
export function FreeAgencyNotice() {
  const { data, isLoading } = useUfaOverview("home");
  if (isLoading || !data?.window.isOpen) return null;
  return (
    <section
      aria-label="Free agency is open"
      className="flex items-center justify-between gap-3 border-b border-slate-300 py-2"
    >
      <span className="text-sm font-semibold">
        <span
          className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-600"
          aria-hidden="true"
        />
        Free agency is open
      </span>
      <Link
        href="/leagueoffice?view=freeAgents"
        className="inline-flex min-h-11 items-center gap-2 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
      >
        Explore free agents
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </section>
  );
}
