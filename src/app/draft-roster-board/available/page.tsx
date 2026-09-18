import type { Metadata } from "next";
import { DraftAvailableTvBoard } from "@gshl-components/draft/DraftTvBoards";
import { requireActiveUser } from "@gshl-lib/auth/require-user";
import type { ProtectedRoutePageProps } from "@gshl-types";

export const metadata: Metadata = {
  title: "Draft TV: available",
  robots: { index: false, follow: false },
};

export default async function DraftTvPage({
  searchParams,
}: ProtectedRoutePageProps) {
  await requireActiveUser("/draft-roster-board/available", await searchParams);
  return <DraftAvailableTvBoard />;
}
