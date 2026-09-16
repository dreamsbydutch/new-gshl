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
      src={currentTeam.logoUrl}
      alt={`${currentTeam.name} logo`}
      className="h-12 w-12 shrink-0 object-contain sm:h-16 sm:w-16"
      width={TEAM_LOGO_SIZE.width}
      height={TEAM_LOGO_SIZE.height}
      onError={() => setErrored(true)}
    />
  ) : (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-slate-100 sm:h-16 sm:w-16">
      <span className="text-xs font-medium text-gray-400">No Logo</span>
    </div>
  );
};

const TeamInfo = ({
  currentTeam,
  formattedOwnerName,
  headingLevel = 1,
}: TeamInfoProps) => {
  const Heading = headingLevel === 1 ? "h1" : "h2";

  return (
    <div className="flex min-w-0 flex-col">
      <Heading className="break-words text-lg font-bold leading-tight text-slate-950 sm:text-2xl">
        {currentTeam.name}
      </Heading>
      <span className="mt-1 text-xs text-slate-500 sm:text-sm">
        {formattedOwnerName}
      </span>
      {+(currentTeam.ownerOwing ?? 0) > 0 ? (
        <span className="mt-1 text-xs font-medium text-red-600">
          {formatMoney(currentTeam.ownerOwing, true)} owing
        </span>
      ) : null}
    </div>
  );
};

export function LockerRoomHeader({
  currentTeam,
  headingLevel,
}: LockerRoomHeaderProps) {
  return (
    <header className="mb-3 flex items-center gap-3 border-b border-slate-200 pb-3 pt-1">
      <TeamLogo currentTeam={currentTeam} />
      <TeamInfo
        currentTeam={currentTeam}
        formattedOwnerName={formatOwnerName(currentTeam)}
        headingLevel={headingLevel}
      />
    </header>
  );
}
