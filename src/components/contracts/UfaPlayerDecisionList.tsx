import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { formatMoney, formatNumber, formatUfaStat } from "@gshl-utils";
import type { UfaFreeAgentView } from "@gshl-types";
import { UfaOfferForm } from "./UfaOfferForm";

const SKATER_STAT_KEYS = [
  "GP",
  "G",
  "A",
  "P",
  "PM",
  "PIM",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
] as const;

const GOALIE_STAT_KEYS = [
  "GP",
  "W",
  "GA",
  "GAA",
  "SV",
  "SA",
  "SVP",
  "SO",
  "QS",
  "RBS",
] as const;

function getStatLabel(
  key: keyof NonNullable<UfaFreeAgentView["stats"]>,
): string {
  if (key === "SVP") return "SV%";
  if (key === "PM") return "+/−";
  return key;
}

function UfaPlayerDecisionCard({ player }: { player: UfaFreeAgentView }) {
  const goalie = player.positionGroup === "G";
  const primaryStatKeys = goalie
    ? (["GP", "W", "GAA", "SVP"] as const)
    : (["GP", "G", "A", "P"] as const);
  const statKeys = goalie ? GOALIE_STAT_KEYS : SKATER_STAT_KEYS;
  const playerHeadingId = `ufa-player-${player.id}`;

  return (
    <article
      aria-labelledby={playerHeadingId}
      className="rounded-xl border border-slate-200 bg-card p-3 shadow-sm"
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-muted/60">
          <NHLLogo
            team={
              player.nhlTeamLogoUrl
                ? {
                    name: player.nhlTeam || "NHL team",
                    logoUrl: player.nhlTeamLogoUrl,
                  }
                : undefined
            }
            size={32}
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3
            id={playerHeadingId}
            className="break-words text-base font-bold leading-tight"
          >
            {player.fullName}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {player.nhlTeam || "Unassigned"}
            {" · "}
            {player.positions.join("/") || player.positionGroup}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            UFA salary
          </p>
          <p className="mt-0.5 text-sm font-black tabular-nums">
            {formatMoney(player.salary)}
          </p>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-muted/45 p-2 text-center">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            OVR
          </dt>
          <dd className="mt-0.5 text-sm font-black tabular-nums">
            {formatNumber(player.overallRating, 2)}
          </dd>
        </div>
        {primaryStatKeys.map((key) => (
          <div key={key}>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {getStatLabel(key)}
            </dt>
            <dd className="mt-0.5 text-sm font-bold tabular-nums">
              {formatUfaStat(player.stats, key)}
            </dd>
          </div>
        ))}
      </dl>

      <details className="mt-2 rounded-lg border border-slate-200 bg-background px-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          All previous-season stats
        </summary>
        <dl className="grid grid-cols-3 gap-x-3 gap-y-2 border-t py-3 text-sm">
          {statKeys.map((key) => (
            <div key={key}>
              <dt className="text-xs text-muted-foreground">
                {getStatLabel(key)}
              </dt>
              <dd className="font-semibold tabular-nums">
                {formatUfaStat(player.stats, key)}
              </dd>
            </div>
          ))}
        </dl>
      </details>

      <div className="mt-3">
        <UfaOfferForm player={player} variant="card" />
      </div>
    </article>
  );
}

export function UfaPlayerDecisionList({
  players,
}: {
  players: UfaFreeAgentView[];
}) {
  return (
    <ul className="space-y-3 lg:hidden" aria-label="Available free agents">
      {players.map((player) => (
        <li key={player.id}>
          <UfaPlayerDecisionCard player={player} />
        </li>
      ))}
    </ul>
  );
}
