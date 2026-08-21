import { Suspense } from "react";
import { ScheduleLayout } from "@gshl-components/schedule/ScheduleLayout";
import { ScheduleSkeleton } from "@gshl-skeletons";

export default function ScheduleRouteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={<ScheduleSkeleton />}>
      <ScheduleLayout>{children}</ScheduleLayout>
    </Suspense>
  );
}
