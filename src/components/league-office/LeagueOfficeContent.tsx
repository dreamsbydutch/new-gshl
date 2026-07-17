"use client";

import { useSession } from "next-auth/react";
import { useLeagueOfficeNavigation } from "@gshl-hooks";
import { ConferenceContest } from "./ConferenceContest";
import { Rulebook } from "./Rulebook";
import { DraftClasses } from "./DraftClasses";
import { UserManagement } from "@gshl-components/auth";

export function LeagueOfficeContent() {
  const { selectedType } = useLeagueOfficeNavigation();
  const { data: session } = useSession();

  return (
    <div className="container mx-auto px-4 py-8">
      {selectedType === "rules" ? <Rulebook /> : null}
      {selectedType === "draft" ? <DraftClasses /> : null}
      {selectedType === "confBattle" ? <ConferenceContest /> : null}
      {selectedType === "users" && session?.user.role === "commissioner" ? (
        <UserManagement />
      ) : null}
    </div>
  );
}
