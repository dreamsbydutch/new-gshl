import {
  RULEBOOK_LAST_UPDATED,
  rulebookSections,
} from "../../../content/rulebook";

/** Shared by the pitch desk, writers, copy editors and matchup reporters. */
export const NEWSROOM_RULEBOOK_CONTEXT = {
  source: "Official GSHL rulebook",
  lastUpdated: RULEBOOK_LAST_UPDATED,
  sections: rulebookSections,
  resultReporting:
    "Category ties are not matchup ties. Under current rules, an equal final category score (including 5-5 or 4-4) is a home-ice victory for the designated home team and a home-ice loss for the away team. Keep the category score unchanged; never add a category to break the tie or call the result a draw. Both clear wins and home-ice wins count in W-L records; both clear losses and home-ice losses count as losses. A team entering 5-1 and losing 5-5 away finishes 5-2, not 5-1-1. Standings points are separate: clear win 3, home-ice win 2, home-ice loss 1, clear loss 0. Total wins determine current standings first, followed by the rulebook tiebreakers. Preserve genuine historical ties when the supplied season usesLegacyTies flag or recorded historical outcome establishes the legacy system; do not rewrite history using today's rules. A level live score is not a completed home-ice win.",
};
