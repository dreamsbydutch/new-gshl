"use client";

import dynamic from "next/dynamic";
import { useAppSearchParams } from "@gshl-hooks";
import { AdminPanelSkeleton, UserManagementSkeleton } from "@gshl-skeletons";
import { TvDisplays } from "./TvDisplays";
import { readContextualNavigationQuery, resolveAdminView } from "@gshl-utils";

const AccountsManagement = dynamic(
  () => import("./AccountsManagement").then((module) => module.AccountsManagement),
  { loading: () => <AdminPanelSkeleton /> },
);
const UserManagement = dynamic(
  () =>
    import("@gshl-components/auth/UserManagement").then(
      (module) => module.UserManagement,
    ),
  { loading: () => <UserManagementSkeleton /> },
);
const ScheduleBuilder = dynamic(
  () => import("./ScheduleBuilder").then((module) => module.ScheduleBuilder),
  { loading: () => <AdminPanelSkeleton /> },
);
const ContractManagement = dynamic(
  () =>
    import("./ContractManagement").then((module) => module.ContractManagement),
  { loading: () => <AdminPanelSkeleton /> },
);
const JobManagement = dynamic(
  () => import("./JobManagement").then((module) => module.JobManagement),
  { loading: () => <AdminPanelSkeleton /> },
);
const ImageUpload = dynamic(
  () => import("./ImageUpload").then((module) => module.ImageUpload),
  { loading: () => <AdminPanelSkeleton /> },
);
const Newsroom = dynamic(
  () => import("./Newsroom").then((module) => module.Newsroom),
  { loading: () => <AdminPanelSkeleton /> },
);
const DraftPickManagement = dynamic(
  () =>
    import("./DraftPickManagement").then(
      (module) => module.DraftPickManagement,
    ),
  { loading: () => <AdminPanelSkeleton /> },
);

export function AdminContent() {
  const { search } = useAppSearchParams();
  const selectedView = resolveAdminView(
    readContextualNavigationQuery(search).view,
  );

  return (
    <div className="container mx-auto px-4 py-8">
      {selectedView === "accounts" ? <AccountsManagement /> : null}
      {selectedView === "contracts" ? <ContractManagement /> : null}
      {selectedView === "draftPicks" ? <DraftPickManagement /> : null}
      {selectedView === "users" ? <UserManagement /> : null}
      {selectedView === "jobs" ? <JobManagement /> : null}
      {selectedView === "newsroom" ? <Newsroom /> : null}
      {selectedView === "images" ? <ImageUpload /> : null}
      {selectedView === "tv" ? <TvDisplays /> : null}
      {selectedView === "scheduleBuilder" ? <ScheduleBuilder /> : null}
    </div>
  );
}
