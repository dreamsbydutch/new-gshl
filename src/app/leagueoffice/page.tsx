"use client";

import { useLeagueOfficeNavigation } from "@gshl-hooks";
import { ConferenceContest } from "@gshl-components/league-office/ConferenceContest";
import { Rulebook } from "@gshl-components/league-office/Rulebook";
import { DraftClasses } from "@gshl-components/league-office/DraftClasses";

export default function LeagueOfficePage() {
  const { selectedType } = useLeagueOfficeNavigation();

  return (
    <div className="container mx-auto px-4 py-8">
      {selectedType === "rules" ? <Rulebook /> : <></>}
      {selectedType === "draft" ? <DraftClasses /> : <></>}
      {selectedType === "confBattle" ? <ConferenceContest /> : <></>}
    </div>
  );
}
