"use client";

import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { useLockerRoomContextNavigation } from "@gshl-hooks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@gshl-ui";

/** Only mounted on My Team; the route layout owns URL/store synchronization. */
export function HeaderTeamSelect() {
  const navigation = useLockerRoomContextNavigation(false);
  const hasTeams = navigation.teamOptions.length > 0;
  const selectedTeam = navigation.teamOptions.find(
    (team) => team.ownerId === navigation.selectedOwnerId,
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 lg:w-48 lg:flex-none">
      <span className="text-[10px] font-semibold text-slate-300 lg:text-slate-500">
        Team
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`View team: ${selectedTeam?.name ?? "Select team"}`}
            disabled={!navigation.isReady || !hasTeams}
            className="flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-70 lg:focus-visible:ring-slate-500"
          >
            {selectedTeam?.logoUrl && (
              <Image
                src={selectedTeam.logoUrl}
                alt=""
                width={24}
                height={24}
                className="h-6 w-6 shrink-0 object-contain"
              />
            )}
            <span className="min-w-0 flex-1 truncate text-left">
              {selectedTeam?.name ??
                (navigation.isReady
                  ? "No teams available"
                  : "Loading teams...")}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={6}
          className="z-[70] max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto"
        >
          <DropdownMenuRadioGroup
            aria-label="View team"
            value={navigation.selectedOwnerId ?? ""}
            onValueChange={navigation.selectOwner}
          >
            {navigation.teamOptions.map((team) => (
              <DropdownMenuRadioItem
                key={team.id}
                value={team.ownerId ?? ""}
                textValue={team.name ?? "Unnamed team"}
                className="min-h-9 cursor-pointer gap-2 text-xs"
              >
                {team.logoUrl && (
                  <Image
                    src={team.logoUrl}
                    alt=""
                    width={24}
                    height={24}
                    className="h-6 w-6 shrink-0 object-contain"
                  />
                )}
                <span className="min-w-0 truncate">
                  {team.name ?? "Unnamed team"}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
