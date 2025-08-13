import { convertInputDate } from "@gshl-utils";
import { api } from "src/trpc/react";

export function useAllContracts() {
  const data = api.contract.getAll.useQuery({});
  return {
    ...data,
    data: data.data?.map((d) => {
      return {
        ...d,
        capHitEndDate: convertInputDate(d.capHitEndDate as unknown as number),
        expiryDate: convertInputDate(d.expiryDate as unknown as number),
        startDate: convertInputDate(d.startDate as unknown as number),
        signingDate: convertInputDate(d.signingDate as unknown as number),
      };
    }),
  };
}
