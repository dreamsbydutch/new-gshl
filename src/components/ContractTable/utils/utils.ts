import type { Contract } from "@gshl-types";

export const getExpiryStatusClass = (expiryStatus: string) => {
  if (expiryStatus === "RFA") {
    return "bg-orange-100 text-orange-700";
  }
  if (expiryStatus === "UFA") {
    return "bg-rose-100 text-rose-800";
  }
  return "";
};

export const calculateCapSpace = (
  contracts: Contract[],
  year: number,
  month = 3,
  day = 19,
) => {
  const CAP_CEILING = 25000000;
  const cutoffDate = new Date(year, month, day);

  const activeContracts = contracts.filter(
    (contract) => contract.capHitEndDate > cutoffDate,
  );

  const totalCapHit = activeContracts.reduce(
    (acc, contract) => acc + +contract.capHit,
    0,
  );

  return CAP_CEILING - totalCapHit;
};

export const getSeasonDisplay = (seasonName: string, yearOffset: number) => {
  const year = +seasonName.slice(0, 4) + yearOffset;
  return `${year}-${year - 1999}`;
};
