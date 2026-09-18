import type { Metadata } from "next";
import { DraftAvailableTvBoard } from "@gshl-components/draft/DraftTvBoards";

export const metadata: Metadata = {
  title: "Draft TV: available",
  robots: { index: false, follow: false },
};

export default function DraftTvPage() {
  return <DraftAvailableTvBoard />;
}
