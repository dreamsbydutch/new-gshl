"use client";

import dynamic from "next/dynamic";
import { useLeagueOfficeNavigation } from "@gshl-hooks";
import {
  ConferenceContestSkeleton,
  DraftClassesSkeleton,
  FreeAgencySkeleton,
  OwnerRankingsSkeleton,
} from "@gshl-skeletons";
import { resolveLeagueOfficeView } from "@gshl-utils";

const ConferenceContest = dynamic(
  () =>
    import("./ConferenceContest").then((module) => module.ConferenceContest),
  { loading: () => <ConferenceContestSkeleton /> },
);
const OwnerRankings = dynamic(
  () => import("./OwnerRankings").then((module) => module.OwnerRankings),
  { loading: () => <OwnerRankingsSkeleton /> },
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

  return (
    <div className="gshl-page">
      {activeType === "draft" ? <DraftClasses /> : null}
      {activeType === "confBattle" ? <ConferenceContest /> : null}
      {activeType === "ownerRankings" ? <OwnerRankings /> : null}
      {activeType === "freeAgents" ? <UfaLeagueOffice /> : null}
      {activeType === "performances" ? <Performances /> : null}
    </div>
  );
}
