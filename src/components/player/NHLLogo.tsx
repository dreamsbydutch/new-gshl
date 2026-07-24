import Image from "next/image";
import { cn } from "@gshl-utils";

export function NHLLogo({
  team,
  size = 32,
  className,
}: {
  team: { abbreviation: string; logoUrl: string; fullName: string } | undefined;
  size?: number;
  className?: string;
}) {
  if (!team?.logoUrl) {
    return (
      <span className={cn("text-[10px] text-gray-400", className)}>-</span>
    );
  }

  return (
    <Image
      src={team.logoUrl}
      className={cn("mx-auto object-contain", className)}
      style={{ width: size, height: size }}
      alt={team.fullName}
      width={size}
      height={size}
    />
  );
}
