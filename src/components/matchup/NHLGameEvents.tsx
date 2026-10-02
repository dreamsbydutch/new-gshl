import { NHLLogo } from "@gshl-components/player/NHLLogo";
import type { buildNHLGameEvents } from "@gshl-utils/features/nhl-events";

export function NHLGameEvents({
  events,
  available,
  upcoming,
  rosterLoading,
  rosterError,
}: {
  events: ReturnType<typeof buildNHLGameEvents>;
  available: boolean;
  upcoming: boolean;
  rosterLoading: boolean;
  rosterError?: string;
}) {
  return (
    <section
      aria-labelledby="game-events-heading"
      className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm sm:rounded-2xl"
    >
      <header className="border-b border-slate-100 px-3 py-3 sm:px-4">
        <h2
          id="game-events-heading"
          className="font-oswald text-xl text-slate-900"
        >
          Game events
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Goals and penalties · Times elapsed in each period ·{" "}
          <strong className="font-semibold">Bold names</strong> are GSHL
          players.
        </p>
        {rosterLoading ? (
          <p role="status" className="mt-1 text-xs text-slate-500">
            Loading GSHL highlights…
          </p>
        ) : rosterError ? (
          <p className="mt-1 text-xs text-slate-500">
            GSHL player highlighting is temporarily unavailable.
          </p>
        ) : null}
      </header>
      {events.length ? (
        <ol className="divide-y divide-slate-100">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex items-start gap-3 px-3 py-3 sm:px-4"
            >
              <div className="w-12 shrink-0 text-center text-xs tabular-nums text-slate-500">
                <div className="font-medium text-slate-700">{event.period}</div>
                <div>{event.time}</div>
              </div>
              {event.team ? (
                <NHLLogo
                  team={{ name: event.team, logoUrl: "" }}
                  size={24}
                  className="!mx-0 shrink-0"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {event.title}
                    {event.description ? (
                      <span className="ml-2 font-normal text-slate-500">
                        {event.description}
                      </span>
                    ) : null}
                  </h3>
                  {event.score ? (
                    <span className="text-xs font-medium tabular-nums text-slate-600">
                      {event.score}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                  {event.participants.map((player, index) => (
                    <span key={`${player.role}-${index}`}>
                      <span className="mr-1 text-slate-400">{player.role}</span>
                      {player.isGshl ? (
                        <strong className="font-bold text-slate-900">
                          {player.name}
                        </strong>
                      ) : (
                        player.name
                      )}
                    </span>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="px-4 py-6 text-center text-sm text-slate-500">
          {upcoming
            ? "Game events will appear once play begins."
            : available
              ? "No goals or penalties recorded yet."
              : "Game events are temporarily unavailable."}
        </p>
      )}
    </section>
  );
}
