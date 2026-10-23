import type { Metadata } from "next";
import { Suspense } from "react";
import { NhlExplorer } from "@gshl-components/nhl/NhlExplorer";
import { requireActiveUser } from "@gshl-lib/auth/require-user";
import type { ProtectedRoutePageProps } from "@gshl-types";

export const metadata: Metadata = { title: "NHL Explorer" };

export default async function NhlExplorerPage({
  searchParams,
}: ProtectedRoutePageProps) {
  await requireActiveUser("/nhl", await searchParams);
  return (
    <Suspense
      fallback={
        <p role="status" className="p-6">
          Loading NHL Explorer…
        </p>
      }
    >
      <NhlExplorer />
    </Suspense>
  );
}
