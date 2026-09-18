import { ChevronDown, ChevronUp } from "lucide-react";

export function DraftPickConnector({ recent }: { recent: boolean }) {
  const Icon = recent ? ChevronDown : ChevronUp;

  return (
    <span
      aria-hidden="true"
      data-pick-connector={recent ? "down" : "up"}
      className={`pointer-events-none absolute left-1/2 top-0 z-10 grid -translate-x-1/2 -translate-y-1/2 place-items-center ${recent ? "text-emerald-600" : "text-amber-600"}`}
    >
      <Icon className="h-[0.85em] w-[0.85em] stroke-[3]" />
    </span>
  );
}
