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

  return (
    <div className="container mx-auto px-4 py-8">
      {selectedType === "rules" ? <Rulebook /> : null}
      {selectedType === "draft" ? <DraftClasses /> : null}
      {selectedType === "confBattle" ? <ConferenceContest /> : null}
      {selectedType === "ownerRankings" ? <OwnerRankings /> : null}
      {selectedType === "freeAgents" ? <UfaLeagueOffice /> : null}
      {selectedType === "users" && session?.user.role === "commissioner" ? (
        <UserManagement />
      ) : null}
      {selectedType === "jobs" && session?.user.role === "commissioner" ? (
        <JobManagement />
      ) : null}
      {selectedType === "contracts" && session?.user.role === "commissioner" ? (
        <ContractManagement />
      ) : null}
      {selectedType === "imageUpload" &&
      session?.user.role === "commissioner" ? (
        <ImageUpload />
      ) : null}
      {selectedType === "newsroom" && session?.user.role === "commissioner" ? (
        <Newsroom />
      ) : null}
    </div>
  );
}
