import { NHLLogo } from "./NHLLogo";

export function NHLLogoList({
  teams,
  size = 18,
  className,
}: {
  teams: ReadonlyArray<{ id: string; name: string; logoUrl: string }>;
  size?: number;
  className?: string;
}) {
  const uniqueTeams = Array.from(
    new Map(teams.map((team) => [team.id, team])).values(),
  );

  if (uniqueTeams.length === 0) {
    return <NHLLogo team={undefined} size={size} className={className} />;
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 ${className ?? ""}`}
    >
      {uniqueTeams.map((team) => (
        <NHLLogo
          key={team.id}
          team={team}
          size={size}
          className="mx-0 shrink-0"
        />
      ))}
    </span>
  );
}
