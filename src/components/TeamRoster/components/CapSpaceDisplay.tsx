import { Contract } from "@gshl-types";
import { formatCurrency } from "@gshl-utils";
import { CAP_CEILING } from "../utils/constants";

interface CapSpaceDisplayProps {
  contracts: Contract[] | undefined;
  showSalaries: boolean;
  totalCapHit: number;
}

export const CapSpaceDisplay = ({
  contracts,
  showSalaries,
  totalCapHit,
}: CapSpaceDisplayProps) => {
  if (!showSalaries) return null;

  return (
    <div className="font-medum mx-auto pb-4 text-center text-lg">
      Cap Space - {contracts && formatCurrency(CAP_CEILING - totalCapHit)}
    </div>
  );
};
