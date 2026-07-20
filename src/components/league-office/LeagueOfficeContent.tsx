"use client";

import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useLeagueOfficeNavigation } from "@gshl-hooks";

const TabLoading = () => (
  <div className="mx-auto h-48 max-w-3xl animate-pulse rounded-xl bg-muted" />
);
const ConferenceContest = dynamic(
  () =>
    import("./ConferenceContest").then((module) => module.ConferenceContest),
  { loading: TabLoading },
);
const OwnerRankings = dynamic(
  () => import("./OwnerRankings").then((module) => module.OwnerRankings),
  { loading: TabLoading },
);
const Rulebook = dynamic(
  () => import("./Rulebook").then((module) => module.Rulebook),
  { loading: TabLoading },
);
const DraftClasses = dynamic(
  () => import("./DraftClasses").then((module) => module.DraftClasses),
  { loading: TabLoading },
);
const UserManagement = dynamic(
  () =>
    import("@gshl-components/auth/UserManagement").then(
      (module) => module.UserManagement,
    ),
  { loading: TabLoading },
);
const ContractManagement = dynamic(
  () =>
    import("@gshl-components/admin/ContractManagement").then(
      (module) => module.ContractManagement,
    ),
  { loading: TabLoading },
);
const JobManagement = dynamic(
  () =>
    import("@gshl-components/admin/JobManagement").then(
      (module) => module.JobManagement,
    ),
  { loading: TabLoading },
);
const UfaLeagueOffice = dynamic(
  () =>
    import("@gshl-components/contracts/UfaSigning").then(
      (module) => module.UfaLeagueOffice,
    ),
  { loading: TabLoading },
);
const ImageUpload = dynamic(
  () => import("./ImageUpload").then((module) => module.ImageUpload),
  { loading: TabLoading },
);

export function LeagueOfficeContent() {
  const { selectedType } = useLeagueOfficeNavigation();
  const { data: session } = useSession();

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
    </div>
  );
}
