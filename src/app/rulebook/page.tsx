import type { Metadata } from "next";
import { Rulebook } from "@gshl-components/league-office/Rulebook";

export const metadata: Metadata = {
  title: "Rulebook",
  description:
    "Official GSHL league rules for scoring, rosters, playoffs, contracts, salary cap, and the draft.",
};

export default function RulebookPage() {
  return (
    <main
      aria-labelledby="rulebook-page-heading"
      className="px-4 py-7 sm:px-6 sm:py-9"
    >
      <h1 id="rulebook-page-heading" className="sr-only">
        Rulebook
      </h1>
      <Rulebook />
    </main>
  );
}
