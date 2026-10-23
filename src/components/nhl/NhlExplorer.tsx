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
    description: "Current strength and historical contribution",
    icon: Users,
  },
  {
    id: "contracts",
    label: "Contracts",
    description: "Salaries at a $100M cap and contract talent",
    icon: Coins,
  },
  {
    id: "players",
    label: "Player GAR",
    description: "Season contributions above replacement",
    icon: ChartNoAxesCombined,
  },
] as const;

export function NhlExplorer() {
  const { search } = useAppSearchParams();
  const requested = new URLSearchParams(search).get("view");
  const view = views.find((item) => item.id === requested)?.id ?? "teams";
  return (
    <div className="container mx-auto space-y-6 px-4 py-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Around the NHL
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">NHL Explorer</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Explore the talent behind the teams, the value of each contract, and
          what players contribute on the ice.
        </p>
      </header>
      <nav aria-label="NHL Explorer" className="grid gap-2 sm:grid-cols-3">
        {views.map(({ id, label, description, icon: Icon }) => (
          <Link
            key={id}
            href={`/nhl?view=${id}`}
            aria-current={view === id ? "page" : undefined}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500",
              view === id
                ? "border-slate-900 bg-slate-900 text-white"
                : "bg-background hover:bg-muted",
            )}
          >
            <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <span>
              <span className="block font-semibold">{label}</span>
              <span
                className={cn(
                  "mt-1 block text-xs",
                  view === id ? "text-slate-300" : "text-muted-foreground",
                )}
              >
                {description}
              </span>
            </span>
          </Link>
        ))}
      </nav>
      {view === "teams" && <Teams />}
      {view === "contracts" && <Contracts readOnly />}
      {view === "players" && <Players />}
    </div>
  );
}
