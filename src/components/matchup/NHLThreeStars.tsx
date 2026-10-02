import { NHLLogo } from "@gshl-components/player/NHLLogo";
import type { NHLGame } from "@gshl-lib/types/nhl";
import { isNHLGameFinal } from "@gshl-utils/features/nhl";

export function NHLThreeStars({ game }: { game: NHLGame }) {
  if (!isNHLGameFinal(game.gameState)) return null;
  const stars = [...(game.threeStars ?? [])].sort((a, b) => a.star - b.star);
  return (
    <section
      aria-labelledby="nhl-three-stars-heading"
      className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"
    >
      <h2 id="nhl-three-stars-heading" className="text-xs font-semibold">
        Three Stars
      </h2>
      {stars.length ? (
        <ol className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {stars.map((star) => (
            <li key={star.star} className="flex items-center gap-1.5">
              <span
                aria-label={`${star.star}${star.star === 1 ? "st" : star.star === 2 ? "nd" : "rd"} star`}
                className="font-semibold text-amber-700"
              >
                {star.star} <span aria-hidden="true">★</span>
              </span>
              <NHLLogo
                team={{ name: star.teamAbbrev, logoUrl: "" }}
                size={18}
                className="!mx-0 shrink-0"
              />
              <span>{star.name.default}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-slate-700">
          {game.threeStars == null
            ? "Three Stars are temporarily unavailable."
            : "The NHL has not announced the Three Stars yet."}
        </p>
      )}
    </section>
  );
}
