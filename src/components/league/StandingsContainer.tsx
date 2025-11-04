"use client";

/**
 * StandingsContainer Component
 *
 * Displays league standings organized into groups (divisions/conferences)
 * with team records, logos, and expandable probability information.
 * Supports multiple standings types including Overall, Conference, Wildcard,
 * and Losers Tourney.
 *
 * Features:
 * - Multiple standings types (Overall, Conference, Wildcard, Losers Tourney)
 * - Team logos with fallback placeholders
 * - Win-loss records
 * - Expandable team details with tiebreak points and seed probabilities
 * - Organized by divisions/conferences
 * - Click to expand/collapse team details
 *
 * @example
 * ```tsx
 * <StandingsContainer standingsType="Overall" />
 * <StandingsContainer standingsType="Conference" />
 * ```
 */

import { useState } from "react";
import Image from "next/image";
import { LoadingSpinner } from "@gshl-ui";
import { cn } from "@gshl-utils";
import type {
  StandingsContainerProps,
  StandingsItemProps,
  StandingsTeamInfoProps,
  StandingsGroup,
} from "@gshl-utils";
import {
  OVERALL_SEED_FIELDS,
  CONFERENCE_SEED_FIELDS,
  WILDCARD_FIELDS,
  LOSERS_TOURNEY_FIELDS,
  formatSeedPosition,
  calculatePercentage,
} from "@gshl-utils";
import type { Season } from "@gshl-types";
import { useStandingsData } from "@gshl-hooks";

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

/**
 * ProbabilityItem Component
 *
 * Displays a single probability value with its label.
 * Hidden if probability is zero (except for specific draft pick fields).
 */
const ProbabilityItem = ({
  fieldName,
  probability,
  label,
}: {
  fieldName: string;
  probability: number;
  label: string;
}) => {
  // Hide zero probabilities except for specific draft pick fields
  if (
    probability === 0 &&
    fieldName !== "1stPickPer" &&
    fieldName !== "3rdPickPer" &&
    fieldName !== "4thPickPer" &&
    fieldName !== "8thPickPer"
  ) {
    return null;
  }

  // Hide draft pick fields if they have no value
  if (
    (fieldName === "1stPickPer" ||
      fieldName === "3rdPickPer" ||
      fieldName === "4thPickPer" ||
      fieldName === "8thPickPer") &&
    !probability
  ) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1 border-r border-gray-500 px-2 last:border-none">
      <div className="text-xs font-bold">{label}</div>
      <div className="text-xs">{calculatePercentage(probability)}</div>
    </div>
  );
};

/**
 * TeamInfo Component
 *
 * Displays team probability information based on standings type.
 * Shows seed probabilities for different playoff scenarios
 * (Overall seeds, Conference seeds, Wildcard, Losers Tourney).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TeamInfo = ({ teamProb, standingsType }: StandingsTeamInfoProps) => {
  switch (standingsType) {
    case "Overall":
      return (
        <div className="col-span-12 mb-3 mt-1 flex flex-row flex-wrap justify-center">
          {OVERALL_SEED_FIELDS.map((field, index) => {
            const probability = teamProb[field as keyof typeof teamProb];
            const label = formatSeedPosition(index, "Ovr");
            return (
              <ProbabilityItem
                key={field}
                fieldName={field}
                probability={probability}
                label={label}
              />
            );
          })}
        </div>
      );

    case "Conference":
      return (
        <div className="col-span-12 mb-3 mt-1 flex flex-row flex-wrap justify-center">
          {CONFERENCE_SEED_FIELDS.map((field, index) => {
            const probability = teamProb[field as keyof typeof teamProb];
            const label = formatSeedPosition(index, "Conf");
            return (
              <ProbabilityItem
                key={field}
                fieldName={field}
                probability={probability}
                label={label}
              />
            );
          })}
        </div>
      );

    case "Wildcard":
      return (
        <div className="col-span-12 mb-3 mt-1 flex flex-row flex-wrap justify-center">
          {WILDCARD_FIELDS.map((field) => {
            const probability = teamProb[field as keyof typeof teamProb];
            const label = field.replace("Per", "");
            return (
              <ProbabilityItem
                key={field}
                fieldName={field}
                probability={probability}
                label={label}
              />
            );
          })}
        </div>
      );

    case "LosersTourney":
      return (
        <div className="col-span-12 mb-3 mt-1 flex flex-row flex-wrap justify-center">
          {LOSERS_TOURNEY_FIELDS.map((field) => {
            const probability = teamProb[field as keyof typeof teamProb];
            const label = field.replace("Per", "");
            return (
              <ProbabilityItem
                key={field}
                fieldName={field}
                probability={probability}
                label={label}
              />
            );
          })}
        </div>
      );

    default:
      return <div></div>;
  }
};

/**
 * StandingsItem Component
 *
 * Displays a single team's standings entry with logo, name, and win-loss record.
 * Expandable to show additional tiebreak points and seed probability information.
 * Click anywhere on the row to toggle expanded state.
 */
const StandingsItem = ({ team }: StandingsItemProps) => {
  const [showInfo, setShowInfo] = useState(false);

  if (!team) return <LoadingSpinner />;

  return (
    <div
      key={team.id}
      className="border-b border-dotted border-gray-400"
      onClick={() => setShowInfo(!showInfo)}
    >
      <div className="mx-auto flex items-center justify-between px-2 py-0.5 text-center font-varela">
        <div className="p-1">
          {team.logoUrl ? (
            <Image
              className="w-12"
              src={team.logoUrl}
              alt="Team Logo"
              width={48}
              height={48}
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded bg-gray-200">
              <span className="text-xs text-gray-400">?</span>
            </div>
          )}
        </div>
        <div className="text-base font-bold">{team.name}</div>
        <div className="text-base font-bold">
          {team.seasonStats?.teamW} - {team.seasonStats?.teamL}
        </div>
      </div>
      {showInfo ? (
        <>
          <div className="col-span-12 mb-0.5 flex flex-row flex-wrap justify-center">
            <div className="pr-2 text-2xs font-bold">Tiebreak Pts:</div>
            <div className="text-2xs">-- pts</div>
          </div>
          {/* <TeamInfo {...{ teamProb, standingsType }} /> */}
        </>
      ) : null}
    </div>
  );
};

/**
 * StandingsGroupComponent
 *
 * Displays a group of teams (division/conference) with a title header
 * and list of standings items. Groups teams by division or conference
 * depending on the standings type.
 */
interface StandingsGroupProps {
  group: StandingsGroup;
  selectedSeason: Season | null;
  standingsType: string;
}

const StandingsGroupComponent = ({
  group,
  selectedSeason,
  standingsType,
}: StandingsGroupProps) => {
  return (
    <div key={group.title}>
      <div className="mt-8 text-center font-varela text-sm font-bold">
        {group.title}
      </div>
      <div
        className={cn(
          "mb-4 rounded-xl p-2 shadow-md [&>*:last-child]:border-none",
        )}
      >
        {selectedSeason &&
          group.teams.map((team) => {
            return (
              <StandingsItem
                key={team.id}
                team={team}
                season={selectedSeason}
                standingsType={standingsType}
              />
            );
          })}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * StandingsContainer Component
 *
 * Main standings orchestrator that fetches standings data and renders
 * groups of teams organized by division/conference. Uses the useStandingsData
 * hook to get team data and group them appropriately.
 *
 * Supports multiple standings views:
 * - Overall: League-wide standings
 * - Conference: Conference-based standings
 * - Wildcard: Wildcard race standings
 * - LosersTourney: Losers tournament draft position standings
 *
 * @param standingsType - Type of standings to display
 */
export const StandingsContainer = ({
  standingsType,
}: StandingsContainerProps) => {
  const { selectedSeason, groups } = useStandingsData({ standingsType });

  return (
    <>
      {groups.map((group) => (
        <StandingsGroupComponent
          key={group.title}
          group={group}
          selectedSeason={selectedSeason ?? null}
          standingsType={standingsType}
        />
      ))}
    </>
  );
};
