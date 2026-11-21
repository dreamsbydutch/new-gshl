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
      className="h-9 w-9 shrink-0 object-contain sm:h-11 sm:w-11"
      width={TEAM_LOGO_SIZE.width}
      height={TEAM_LOGO_SIZE.height}
      onError={() => setErrored(true)}
    />
  ) : (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-slate-100 sm:h-11 sm:w-11">
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
      <Heading className="break-words text-base font-bold leading-tight text-slate-950 sm:text-lg">
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
  yahooTeamId,
}: LockerRoomHeaderProps) {
  return (
    <header className="mb-2 flex items-center gap-2 border-b border-slate-200 py-2">
      <TeamLogo currentTeam={currentTeam} />
      <TeamInfo
        currentTeam={currentTeam}
        formattedOwnerName={formatOwnerName(currentTeam)}
        headingLevel={headingLevel}
      />
      {yahooTeamId && (
        <a
          href={`https://hockey.fantasysports.yahoo.com/hockey/44541/${encodeURIComponent(yahooTeamId)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Manage lineup on Yahoo (opens in a new tab)"
          title="Manage lineup on Yahoo (opens in a new tab)"
          className="ml-auto inline-flex min-h-11 shrink-0 items-center rounded px-1 focus-visible:ring-2 focus-visible:ring-slate-500"
        >
          <Image
            src="/yahoo-fantasy.png"
            alt=""
            width={48}
            height={16}
            className="h-auto w-12"
          />
        </a>
      )}
    </header>
  );
}
