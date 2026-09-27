import Image from "next/image";
import { TableViewport } from "@gshl-ui";
import type {
  NHLBoxscorePlayer,
  NHLMatchupPlayerRow,
} from "@gshl-lib/types/nhl";

export function NHLMatchupPlayerTable({
  players,
  goalies = false,
}: {
  players: NHLMatchupPlayerRow[];
  goalies?: boolean;
}) {
  const columns: { key: keyof NHLBoxscorePlayer; label: string }[] = goalies
    ? [
        { key: "saves", label: "SV" },
        { key: "shotsAgainst", label: "SA" },
        { key: "goalsAgainst", label: "GA" },
        { key: "savePctg", label: "SV%" },
        { key: "toi", label: "TOI" },
      ]
    : [
        { key: "goals", label: "G" },
        { key: "assists", label: "A" },
        { key: "points", label: "P" },
        { key: "powerPlayGoals", label: "PPG" },
        { key: "sog", label: "SOG" },
        { key: "hits", label: "HIT" },
        { key: "blockedShots", label: "BLK" },
        { key: "plusMinus", label: "+/−" },
        { key: "pim", label: "PIM" },
        { key: "toi", label: "TOI" },
      ];
  const label = goalies ? "Goaltenders" : "Skaters";
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm sm:rounded-2xl">
      <TableViewport
        ariaLabel={`${label} NHL game statistics`}
        scrollHint="Scroll to review every player statistic"
        viewportClassName="rounded-none border-0"
      >
        <table className="w-max min-w-full border-collapse text-xs sm:text-sm">
          <caption className="sr-only">
            {label}, GSHL teams and recorded game-day lineup positions
          </caption>
          <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 bg-slate-50 px-3 py-3 text-left"
              >
                Player
              </th>
              <th scope="col" className="px-3 py-3">
                GSHL lineup
              </th>
              {columns.map((column) => (
                <th scope="col" key={column.key} className="px-3 py-3">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!players.length ? (
              <tr>
                <td
                  colSpan={columns.length + 2}
                  className="px-3 py-6 text-center text-slate-500"
                >
                  No GSHL {goalies ? "goaltenders" : "skaters"} recorded for
                  this team and date.
                </td>
              </tr>
            ) : (
              players.map((player) => (
                <tr
                  key={player.id}
                  className={`border-b border-slate-200 last:border-0 ${["BN", "IR", "IR+", "IRplus"].includes(player.lineupPosition ?? "") ? "bg-slate-100 text-slate-500 [&_img]:opacity-60" : "odd:bg-white even:bg-slate-50/70"}`}
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-inherit px-3 py-2 text-left font-normal"
                  >
                    <span className="flex items-center gap-2">
                      {player.gshlTeam.logoUrl ? (
                        <Image
                          src={player.gshlTeam.logoUrl}
                          alt={player.gshlTeam.name ?? "GSHL team"}
                          title={player.gshlTeam.name ?? undefined}
                          width={24}
                          height={24}
                          className="h-6 w-6 shrink-0 object-contain"
                        />
                      ) : (
                        <span
                          className="text-[10px]"
                          title={player.gshlTeam.name ?? undefined}
                        >
                          {player.gshlTeam.abbr ?? "GSHL"}
                        </span>
                      )}
                      <span
                        className="max-w-36 truncate sm:max-w-none"
                        title={player.fullName}
                      >
                        {player.fullName}
                      </span>
                    </span>
                  </th>
                  <td className="whitespace-nowrap px-3 py-2 text-center">
                    <span className="font-medium" title={player.lineupStatus}>
                      {player.lineupPosition ?? "–"}
                    </span>
                  </td>
                  {columns.map((column) => {
                    const value = player.stats?.[column.key];
                    return (
                      <td
                        key={column.key}
                        className="px-3 py-2 text-center tabular-nums"
                      >
                        {value == null
                          ? "–"
                          : column.key === "savePctg" &&
                              typeof value === "number"
                            ? value.toFixed(3)
                            : value}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableViewport>
    </section>
  );
}
