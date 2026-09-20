"use client";

import { useDraftModeControl } from "@gshl-hooks/features/useDraftModeControl";
import { cn } from "@gshl-utils";

export function DraftModeControl({ seasonId }: { seasonId?: string }) {
  const control = useDraftModeControl(seasonId);
  if (!control.team) return null;
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex max-w-full items-center gap-2">
        {control.isCommissioner ? (
          <select
            aria-label="Team draft mode"
            value={control.team.id}
            onChange={(event) => control.setSelectedId(event.target.value)}
            className="h-9 min-w-0 max-w-48 rounded border border-slate-300 bg-white px-2 text-xs focus-visible:ring-2 focus-visible:ring-slate-500"
          >
            {control.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
                {team.draftAuto ? " · Auto" : " · Live"}
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(control.team.draftAuto)}
          aria-label={`${control.team.name} automatic drafting`}
          disabled={control.isPending}
          onClick={control.toggle}
          title="Two consecutive timeouts switch your team to Auto. Switch to Live to resume picking."
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 disabled:opacity-50",
            control.team.draftAuto
              ? "border-red-600 bg-red-600 text-white"
              : "border-slate-300 bg-slate-100 text-slate-800",
          )}
        >
          <span
            className={cn(
              "relative h-4 w-7 rounded-full",
              control.team.draftAuto ? "bg-red-800" : "bg-slate-400",
            )}
            aria-hidden="true"
          >
            <span
              className={cn(
                "absolute top-0.5 h-3 w-3 rounded-full bg-white",
                control.team.draftAuto ? "right-0.5" : "left-0.5",
              )}
            />
          </span>
          {control.team.draftAuto ? "Auto" : "Live"}
        </button>
      </div>
      {control.error ? (
        <p role="alert" className="text-xs text-red-700">
          {control.error}
        </p>
      ) : null}
    </div>
  );
}
