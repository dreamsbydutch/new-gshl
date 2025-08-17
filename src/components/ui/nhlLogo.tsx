import Image from "next/image";

export function NHLLogo({
  team,
  size = 32,
  className,
}: {
  team: { abbreviation: string; logoUrl: string; fullName: string } | undefined;
  size?: number;
  className?: string;
}) {
  if (!team) return <span className="text-[10px] text-gray-400">-</span>;
  return (
    <Image
      src={team.logoUrl}
      className={`mx-auto h-[${size}px] w-[${size}px] ${className ?? ""}`}
      alt={team.fullName}
      width={size}
      height={size}
    />
  );
}
