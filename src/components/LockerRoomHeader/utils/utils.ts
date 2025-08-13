import { GSHLTeam } from "@gshl-types";

export const formatOwnerName = (team: GSHLTeam) => {
  const { ownerFirstName, ownerNickname, ownerLastName } = team;

  return `${ownerFirstName}${
    ownerNickname ? ` '${ownerNickname}' ` : " "
  }${ownerLastName}`;
};
