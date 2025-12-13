"use client";

import { DraftClasses, Rulebook } from "@gshl-components/league";
import { useLeagueOfficeNavigation } from "@gshl-cache";

export default function LeagueOfficePage() {
  const { selectedType } = useLeagueOfficeNavigation();

  return (
    <div className="container mx-auto px-4 py-8">
      {selectedType === "rules" ? <Rulebook /> : <DraftClasses />}
    </div>
  );
}
