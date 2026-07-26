import type { Metadata } from "next";
import { DraftRosterBoard } from "@gshl-components/draft/DraftRosterBoard";

export const metadata: Metadata = {
  title: "Draft Roster Board",
  robots: {
    index: false,
    follow: false,
  },
};

export default function DraftRosterBoardPage() {
  return <DraftRosterBoard />;
}
