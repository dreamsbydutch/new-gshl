"use client";

import { useLeagueOfficeNavigation } from "@gshl-hooks";
import { ConferenceContest } from "@gshl-components/league-office/ConferenceContest";
import { Rulebook } from "@gshl-components/league-office/Rulebook";
import { DraftClasses } from "@gshl-components/league-office/DraftClasses";
import { UserManagement } from "@gshl-components/auth";
import { useSession } from "next-auth/react";

export default function LeagueOfficePage() {
  const { selectedType } = useLeagueOfficeNavigation();
  const { data: session } = useSession();

  return (
    <div className="container mx-auto px-4 py-8">
      {selectedType === "rules" ? <Rulebook /> : <></>}
      {selectedType === "draft" ? <DraftClasses /> : <></>}
      {selectedType === "confBattle" ? <ConferenceContest /> : <></>}
      {selectedType === "users" && session?.user.role === "commissioner" ? (
        <UserManagement />
      ) : null}
    </div>
  );
}
