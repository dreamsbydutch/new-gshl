import { Suspense } from "react";
import { AdminLayout } from "@gshl-components/admin";
import { AdminPanelSkeleton } from "@gshl-skeletons";

export default function AdminRouteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={<AdminPanelSkeleton />}>
      <AdminLayout>{children}</AdminLayout>
    </Suspense>
  );
}
