import type { Contract } from "@gshl-types";
import { Skeleton } from "../ui/skeleton";

export function PlayerContractRowSkeleton({
  contract,
}: {
  contract: Contract;
}) {
  console.log(contract)
  return <Skeleton className="mr-4 h-6 w-28" />;
}
