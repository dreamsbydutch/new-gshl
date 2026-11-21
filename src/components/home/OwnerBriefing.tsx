"use client";

import Link from "next/link";
import type { useHomeDashboard } from "@gshl-hooks/features/useHomeDashboard";

export function OwnerBriefing({
  view,
}: {
  view: ReturnType<typeof useHomeDashboard>;
}) {
  const owner = view.owner.data;
  if (!owner || view.matchup) return null;
  return (
    <section className="rounded-lg bg-slate-950 p-3 text-white">
      <p className="text-xs uppercase tracking-wider text-slate-400">
        Between matchups
      </p>
      <h2 className="mt-1 text-xl font-bold">{owner.team?.name}</h2>

      <div className="mt-1 flex flex-wrap gap-2">
        <Link
          href={owner.actions.viewDraftPicks}
          className="inline-flex min-h-11 items-center text-sm font-semibold"
        >
          Your draft picks →
        </Link>
        <Link
          href={owner.actions.viewContracts}
          className="inline-flex min-h-11 items-center text-sm font-semibold"
        >
          Contracts & cap →
        </Link>
      </div>
    </section>
  );
}
