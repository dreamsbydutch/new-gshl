import type { GSHLTeam } from "@gshl-types";

/**
 * Formats an owner's display name, inserting nickname in single quotes when present.
 * Example: John 'Hammer' Doe OR Jane Doe
 * @param team Team containing owner name fields.
 * @returns Human-readable owner name string.
 */
export const formatOwnerName = (team: GSHLTeam) => {
  const { ownerFirstName, ownerNickname, ownerLastName } = team;

  return `${ownerFirstName}${
    ownerNickname ? ` '${ownerNickname}' ` : " "
  }${ownerLastName}`;
};
