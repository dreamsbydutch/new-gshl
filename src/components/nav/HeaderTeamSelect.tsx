"use client";

import { useLockerRoomContextNavigation } from "@gshl-hooks";

/** Only mounted on My Team; the route layout owns URL/store synchronization. */
export function HeaderTeamSelect() {
  const navigation = useLockerRoomContextNavigation(false);
  const hasTeams = navigation.teamOptions.length > 0;

  return (
    <label className="flex min-w-0 flex-1 flex-col gap-0.5 lg:w-48 lg:flex-none">
      <span className="text-[10px] font-semibold text-slate-300 lg:text-slate-500">
        Team
      </span>
      <select
        aria-label="View team"
        value={navigation.selectedOwnerId ?? ""}
        disabled={!navigation.isReady || !hasTeams}
        onChange={(event) => navigation.selectOwner(event.target.value)}
        className="h-9 w-full min-w-0 truncate rounded-md border border-slate-300 bg-white px-2 pr-6 text-xs font-semibold text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-70 lg:focus-visible:ring-slate-500"
      >
        {!hasTeams && (
          <option value="">
            {navigation.isReady ? "No teams available" : "Loading teams…"}
          </option>
        )}
        {navigation.teamOptions.map((team) => (
          <option key={team.id} value={team.ownerId ?? ""}>
            {team.name ?? "Unnamed team"}
          </option>
        ))}
      </select>
    </label>
  );
}
