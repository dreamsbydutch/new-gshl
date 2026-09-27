"use client";

import Link from "next/link";
import { useInjuryReport } from "@gshl-hooks/main/useInjuryReport";
import { findPlayerInjury } from "@gshl-utils/features/injuries";

export function PlayerInjuryBadge({
  name,
  teams,
}: {
  name: string;
  teams?: string | string[] | null;
}) {
  const { data, error } = useInjuryReport();
  const injury = data ? findPlayerInjury(data.injuries, name, teams) : null;
  if (!injury) return null;
  const stale = Boolean(error) || Date.now() - data!.fetchedAt > 60 * 60 * 1000;
  return (
    <Link
      href={`/injuries#injury-${injury.id}`}
      className="ml-1 inline-flex rounded bg-red-100 px-1 py-0.5 text-[10px] font-semibold text-red-800"
      aria-label={`${name}: ${injury.status}${stale ? ", update delayed" : ""}. View injury details.`}
      title={`${injury.status}: ${injury.description ?? "Details unavailable"}. ESPN${stale ? " — update delayed" : ""}`}
    >
      {injury.designation}
      {stale ? "*" : ""}
    </Link>
  );
}
