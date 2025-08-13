import { RATING_RANGES } from "../utils/constants";

export const RatingLegend = () => {
  return (
    <div className="my-2 flex justify-center gap-2">
      {RATING_RANGES.map((rating) => (
        <div
          key={rating.range}
          className={`max-w-fit place-self-center rounded-lg px-2 text-3xs ${rating.class}`}
        >
          {rating.range}
        </div>
      ))}
    </div>
  );
};
