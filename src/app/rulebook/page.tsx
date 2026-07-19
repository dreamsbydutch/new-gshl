import type { Metadata } from "next";
import { Rulebook } from "@gshl-components/league-office/Rulebook";

export const metadata: Metadata = {
  title: "Rulebook",
  description:
    "Official GSHL league rules for scoring, rosters, playoffs, contracts, salary cap, and the draft.",
};

export default function RulebookPage() {
  return (
    <div className="px-4 py-7 sm:px-6 sm:py-9">
      <Rulebook />
    </div>
  );
}
