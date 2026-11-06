"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ChartNoAxesCombined, Coins, Users } from "lucide-react";
import { useAppSearchParams } from "@gshl-hooks";
import { cn } from "@gshl-utils";

const loading = () => (
  <p role="status" className="rounded-xl border p-6">
    Loading NHL data…
  </p>
);
const Teams = dynamic(
  () =>
    import("../admin/NormalizedNhlRosters").then((m) => m.NormalizedNhlRosters),
  { loading },
);
const Contracts = dynamic(
  () =>
    import("../admin/NormalizedNhlContracts").then(
      (m) => m.NormalizedNhlContracts,
    ),
  { loading },
);
const Players = dynamic(
  () => import("./NhlPlayerGarRankings").then((m) => m.NhlPlayerGarRankings),
  { loading },
);
const views = [
  {
    id: "teams",
    label: "Team talent",
    icon: Users,
  },
  {
    id: "contracts",
    label: "Contracts",
    icon: Coins,
  },
  {
    id: "players",
    label: "Player GAR",
    icon: ChartNoAxesCombined,
  },
] as const;

export function NhlExplorer() {
  const { search } = useAppSearchParams();
  const requested = new URLSearchParams(search).get("view");
  const view = views.find((item) => item.id === requested)?.id ?? "teams";
  return (
    <div className="container mx-auto space-y-3 px-3 py-3 sm:px-4">
      <header>
        <h1 className="text-xl font-bold tracking-tight">NHL Explorer</h1>
      </header>
      <nav aria-label="NHL Explorer" className="grid grid-cols-3 gap-2">
        {views.map(({ id, label, icon: Icon }) => (
          <Link
            key={id}
            href={`/nhl?view=${id}`}
            aria-current={view === id ? "page" : undefined}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 sm:text-sm",
              view === id
                ? "border-slate-900 bg-slate-900 text-white"
                : "bg-background hover:bg-muted",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="font-semibold">{label}</span>
          </Link>
        ))}
      </nav>
      {view === "teams" && <Teams />}
      {view === "contracts" && <Contracts readOnly />}
      {view === "players" && <Players />}
    </div>
  );
}
