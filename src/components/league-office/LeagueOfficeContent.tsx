"use client";

import dynamic from "next/dynamic";
import { useAuthSession, useLeagueOfficeNavigation } from "@gshl-hooks";
import {
  AdminPanelSkeleton,
  ConferenceContestSkeleton,
  DraftClassesSkeleton,
  FreeAgencySkeleton,
  OwnerRankingsSkeleton,
  RulebookSkeleton,
  UserManagementSkeleton,
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
const TradeBlock = dynamic(
  () => import("./TradeBlock").then((module) => module.TradeBlock),
  { loading: () => <AdminPanelSkeleton /> },
);
const UserManagement = dynamic(
  () =>
    import("@gshl-components/auth/UserManagement").then(
      (module) => module.UserManagement,
    ),
  { loading: () => <UserManagementSkeleton /> },
);
const ContractManagement = dynamic(
  () =>
    import("@gshl-components/admin/ContractManagement").then(
      (module) => module.ContractManagement,
    ),
  { loading: () => <AdminPanelSkeleton /> },
);
const JobManagement = dynamic(
  () =>
    import("@gshl-components/admin/JobManagement").then(
      (module) => module.JobManagement,
    ),
  { loading: () => <AdminPanelSkeleton /> },
);
const UfaLeagueOffice = dynamic(
  () =>
    import("@gshl-components/contracts/UfaSigning").then(
      (module) => module.UfaLeagueOffice,
    ),
  { loading: () => <FreeAgencySkeleton /> },
);
const ImageUpload = dynamic(
  () => import("./ImageUpload").then((module) => module.ImageUpload),
  { loading: () => <AdminPanelSkeleton /> },
);
const Newsroom = dynamic(
  () => import("./Newsroom").then((module) => module.Newsroom),
  { loading: () => <AdminPanelSkeleton /> },
);

export function LeagueOfficeContent() {
  const { selectedType } = useLeagueOfficeNavigation();
  const { session } = useAuthSession();
  const activeType = resolveLeagueOfficeView(selectedType, session?.user.role);
  const usesCompactLayout =
    activeType === "draft" || activeType === "tradeBlock";

  return (
    <div
      className={cn(
        "container mx-auto px-4",
        usesCompactLayout ? "py-4" : "py-8",
      )}
    >
      {activeType === "rules" ? <Rulebook /> : null}
      {activeType === "draft" ? <DraftClasses /> : null}
      {activeType === "tradeBlock" ? <TradeBlock /> : null}
      {activeType === "confBattle" ? <ConferenceContest /> : null}
      {activeType === "ownerRankings" ? <OwnerRankings /> : null}
      {activeType === "freeAgents" ? <UfaLeagueOffice /> : null}
      {activeType === "users" && session?.user.role === "commissioner" ? (
        <UserManagement />
      ) : null}
      {activeType === "jobs" && session?.user.role === "commissioner" ? (
        <JobManagement />
      ) : null}
      {activeType === "contracts" && session?.user.role === "commissioner" ? (
        <ContractManagement />
      ) : null}
      {activeType === "imageUpload" && session?.user.role === "commissioner" ? (
        <ImageUpload />
      ) : null}
      {activeType === "newsroom" && session?.user.role === "commissioner" ? (
        <Newsroom />
      ) : null}
    </div>
  );
}
