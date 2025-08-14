import type { TeamInfoProps } from "../utils/types";
import {
  OVERALL_SEED_FIELDS,
  CONFERENCE_SEED_FIELDS,
  WILDCARD_FIELDS,
  LOSERS_TOURNEY_FIELDS,
} from "../utils/constants";
import { formatSeedPosition, calculatePercentage } from "../utils";

export const TeamInfo = ({ teamProb, standingsType }: TeamInfoProps) => {
  const renderProbabilityItem = (
    fieldName: string,
    probability: number,
    label: string,
  ) => {
    if (
      probability === 0 &&
      fieldName !== "1stPickPer" &&
      fieldName !== "3rdPickPer" &&
      fieldName !== "4thPickPer" &&
      fieldName !== "8thPickPer"
    ) {
      return null;
    }

    if (
      (fieldName === "1stPickPer" ||
        fieldName === "3rdPickPer" ||
        fieldName === "4thPickPer" ||
        fieldName === "8thPickPer") &&
      !probability
    ) {
      return null;
    }

    return (
      <div className="flex flex-col gap-1 border-r border-gray-500 px-2 last:border-none">
        <div className="text-xs font-bold">{label}</div>
        <div className="text-xs">{calculatePercentage(probability)}</div>
      </div>
    );
  };

  switch (standingsType) {
    case "Overall":
      return (
        <div className="col-span-12 mb-3 mt-1 flex flex-row flex-wrap justify-center">
          {OVERALL_SEED_FIELDS.map((field, index) => {
            const probability = teamProb[field as keyof typeof teamProb];
            const label = formatSeedPosition(index, "Ovr");
            return renderProbabilityItem(field, probability, label);
          })}
        </div>
      );

    case "Conference":
      return (
        <div className="col-span-12 mb-3 mt-1 flex flex-row flex-wrap justify-center">
          {CONFERENCE_SEED_FIELDS.map((field, index) => {
            const probability = teamProb[field as keyof typeof teamProb];
            const label = formatSeedPosition(index, "Conf");
            return renderProbabilityItem(field, probability, label);
          })}
        </div>
      );

    case "Wildcard":
      return (
        <div className="col-span-12 mb-3 mt-1 flex flex-row flex-wrap justify-center">
          {WILDCARD_FIELDS.map((field) => {
            const probability = teamProb[field as keyof typeof teamProb];
            const label = field.replace("Per", "");
            return renderProbabilityItem(field, probability, label);
          })}
        </div>
      );

    case "LosersTourney":
      return (
        <div className="col-span-12 mb-3 mt-1 flex flex-row flex-wrap justify-center">
          {LOSERS_TOURNEY_FIELDS.map((field) => {
            const probability = teamProb[field as keyof typeof teamProb];
            const label = field.replace("Per", "");
            return renderProbabilityItem(field, probability, label);
          })}
        </div>
      );

    default:
      return <div></div>;
  }
};
