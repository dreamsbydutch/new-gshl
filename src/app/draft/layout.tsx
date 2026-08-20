import { DraftHubLayout } from "@gshl-components/draft/DraftHubLayout";
import { Suspense } from "react";

export default function DraftLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={null}>
      <DraftHubLayout>{children}</DraftHubLayout>
    </Suspense>
  );
}
