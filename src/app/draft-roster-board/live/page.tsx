import type { Metadata } from "next";
import { DraftLiveTvBoard } from "@gshl-components/draft/DraftTvBoards";

export const metadata: Metadata = {
  title: "Draft TV: live",
  robots: { index: false, follow: false },
};

export default function DraftTvPage() {
  return <DraftLiveTvBoard />;
}
