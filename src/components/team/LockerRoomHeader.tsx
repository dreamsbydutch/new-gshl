"use client";

import Image from "next/image";
import { useState } from "react";
import type {
  LockerRoomHeaderProps,
  TeamInfoProps,
  TeamLogoProps,
} from "@gshl-utils";
import { formatMoney, formatOwnerName, TEAM_LOGO_SIZE } from "@gshl-utils";

const TeamLogo = ({ currentTeam }: TeamLogoProps) => {
  const [errored, setErrored] = useState(false);

  return currentTeam.logoUrl && !errored ? (
    <Image
      className="rounded-lg bg-gray-100 shadow-emboss"
      src={currentTeam.logoUrl}
      alt={`${currentTeam.name} logo`}
      width={TEAM_LOGO_SIZE.width}
      height={TEAM_LOGO_SIZE.height}
      onError={() => setErrored(true)}
    />
  ) : (
    <div
      className="flex items-center justify-center rounded-lg bg-gray-200 shadow-emboss"
      style={{ width: TEAM_LOGO_SIZE.width, height: TEAM_LOGO_SIZE.height }}
    >
      <span className="text-xs font-medium text-gray-400">No Logo</span>
    </div>
  );
};

const TeamInfo = ({ currentTeam, formattedOwnerName }: TeamInfoProps) => (
  <div className="flex flex-col items-center">
    <h1 className="text-center text-3xl font-bold">{currentTeam.name}</h1>
    <span className="text-center text-lg font-semibold">
      {formattedOwnerName}
    </span>
    {+(currentTeam.ownerOwing ?? 0) > 0 ? (
      <span className="mt-1 text-center text-sm font-medium text-red-600">
        {formatMoney(currentTeam.ownerOwing, true)}
      </span>
    ) : null}
  </div>
);

export function LockerRoomHeader({ currentTeam }: LockerRoomHeaderProps) {
  return (
    <header className="mx-auto flex max-w-3xl items-center justify-evenly p-4">
      <TeamLogo currentTeam={currentTeam} />
      <TeamInfo
        currentTeam={currentTeam}
        formattedOwnerName={formatOwnerName(currentTeam)}
      />
    </header>
  );
}
