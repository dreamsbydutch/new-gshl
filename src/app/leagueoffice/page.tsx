"use client";

import { useLeagueOfficeNavigation } from "@gshl-cache";
import { ConferenceContest } from "./ConferenceContest";
import { Rulebook } from "./Rulebook";
import { DraftClasses } from "./DraftClasses";

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
