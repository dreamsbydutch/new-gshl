import type { Contract } from "@gshl-types";
import { formatMoney } from "@gshl-utils";
import { CAP_CEILING } from "@gshl-utils/team-roster";

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
      Cap Space - {contracts && formatMoney(CAP_CEILING - totalCapHit)}
    </div>
  );
};
