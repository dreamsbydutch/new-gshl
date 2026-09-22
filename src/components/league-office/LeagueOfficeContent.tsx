"use client";

import dynamic from "next/dynamic";
import { useLeagueOfficeNavigation } from "@gshl-hooks";
import {
  ConferenceContestSkeleton,
  DraftClassesSkeleton,
  FreeAgencySkeleton,
  OwnerRankingsSkeleton,
  RulebookSkeleton,
} from "@gshl-skeletons";
import { cn, resolveLeagueOfficeView } from "@gshl-utils";

const ConferenceContest = dynamic(
  () =>
    import("./ConferenceContest").then((module) => module.ConferenceContest),
  { loading: () => <ConferenceContestSkeleton /> },
);
const OwnerRankings = dynamic(
  () => import("./OwnerRankings").then((module) => module.OwnerRankings),
  { loading: () => <OwnerRankingsSkeleton /> },
);
const Rulebook = dynamic(
  () => import("./Rulebook").then((module) => module.Rulebook),
  { loading: () => <RulebookSkeleton /> },
);
const DraftClasses = dynamic(
  () => import("./DraftClasses").then((module) => module.DraftClasses),
  { loading: () => <DraftClassesSkeleton /> },
);
const Performances = dynamic(
  () => import("./Performances").then((module) => module.Performances),
  {
    loading: () => <p role="status">Loading performances…</p>,
  },
);
const UfaLeagueOffice = dynamic(
  () =>
    import("@gshl-components/contracts/UfaSigning").then(
      (module) => module.UfaLeagueOffice,
    ),
  { loading: () => <FreeAgencySkeleton /> },
);
export function LeagueOfficeContent() {
  const { selectedType } = useLeagueOfficeNavigation();
  const activeType = resolveLeagueOfficeView(selectedType);
  const usesCompactLayout = activeType === "draft";

  return (
    <div
      className={cn(
        "container mx-auto px-4",
        usesCompactLayout ? "py-4" : "py-8",
      )}
    >
      {activeType === "rules" ? <Rulebook /> : null}
      {activeType === "draft" ? <DraftClasses /> : null}
      {activeType === "confBattle" ? <ConferenceContest /> : null}
      {activeType === "ownerRankings" ? <OwnerRankings /> : null}
      {activeType === "freeAgents" ? <UfaLeagueOffice /> : null}
      {activeType === "performances" ? <Performances /> : null}
    </div>
  );
}
