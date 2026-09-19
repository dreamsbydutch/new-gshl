import Link from "next/link";
import { ExternalLink, ListOrdered, Monitor, UsersRound } from "lucide-react";

const TV_DISPLAYS = [
  {
    href: "/draft-roster-board",
    label: "Roster board",
    description: "All team rosters with the owner ladder or live draft flow.",
    icon: UsersRound,
  },
  {
    href: "/draft-roster-board/available",
    label: "Best available",
    description: "Available skaters, goalies, and league roster makeup.",
    icon: ListOrdered,
  },
  {
    href: "/draft-roster-board/live",
    label: "Live draft",
    description: "On-the-clock team, roster, timer, and pick movement.",
    icon: Monitor,
  },
] as const;

export function TvDisplays() {
  return (
    <section
      className="mx-auto max-w-4xl"
      aria-labelledby="tv-displays-heading"
    >
      <div className="border-b border-slate-200 pb-4">
        <h2 id="tv-displays-heading" className="text-2xl font-semibold">
          TV displays
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Open each public, read-only draft display on its assigned screen.
        </p>
      </div>
      <div className="divide-y divide-slate-200">
        {TV_DISPLAYS.map(({ href, label, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-16 items-center gap-3 px-1 py-3 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 motion-reduce:transition-none"
          >
            <Icon className="h-5 w-5 shrink-0 text-slate-600" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-950">
                {label}
              </span>
              <span className="block text-sm text-slate-600">
                {description}
              </span>
            </span>
            <ExternalLink
              className="h-4 w-4 shrink-0 text-slate-500"
              aria-hidden
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
