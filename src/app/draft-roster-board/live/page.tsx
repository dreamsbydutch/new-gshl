import type { Metadata } from "next";
import { DraftLiveTvBoard } from "@gshl-components/draft/DraftTvBoards";
import { requireActiveUser } from "@gshl-lib/auth/require-user";
import type { ProtectedRoutePageProps } from "@gshl-types";

export const metadata: Metadata = {
  title: "Draft TV: live",
  robots: { index: false, follow: false },
};

export default async function DraftTvPage({
  searchParams,
}: ProtectedRoutePageProps) {
  await requireActiveUser("/draft-roster-board/live", await searchParams);
  return <DraftLiveTvBoard />;
}
