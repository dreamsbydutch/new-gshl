import type {
  DraftHistoryPick,
  DraftResultInput,
} from "../../types/draft-history";

type ContractEnd = {
  playerId: string;
  start: string | null;
  end: string | null;
  status: string | null;
};

const nextDay = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);

/** Follow the opening stint only. Missing team snapshots cannot establish a drop. */
export function buildDraftRosterOutcomes(input: {
  picks: DraftResultInput[];
  start: string | null;
  end: string | null;
  today: string;
  days: { teamId: string; playerId: string; date: string }[];
  contracts: ContractEnd[];
}): Map<string, DraftHistoryPick["outcome"]> {
  const end = input.end;
  const rosters = new Map<string, Set<string>>();
  for (const row of input.days) {
    const key = `${row.teamId}:${row.date}`;
    const roster = rosters.get(key) ?? new Set<string>();
    roster.add(row.playerId);
    rosters.set(key, roster);
  }
  return new Map(
    input.picks.map((pick) => {
      const result = (
        label: string,
        date: string | null = null,
      ): [string, DraftHistoryPick["outcome"]] => [pick.id, { label, date }];
      if (!pick.playerId) return result("Awaiting selection");
      if (!input.start || !end) return result("Roster history unavailable");
      if (input.start > input.today) return result("Season not started");
      const recordedEnd = input.contracts.find(
        (entry) =>
          entry.playerId === pick.playerId &&
          entry.start &&
          entry.start <= input.start! &&
          entry.end &&
          entry.end >= input.start! &&
          entry.end <= end &&
          entry.end <= input.today &&
          ["buyout", "trade", "retired", "injured"].includes(
            entry.status?.toLowerCase() ?? "",
          ),
      );
      const endLabel = (status: string | null | undefined) => {
        switch (status?.toLowerCase()) {
          case "buyout":
            return "Bought out";
          case "trade":
            return "Traded";
          case "retired":
            return "Retired";
          case "injured":
            return "Injury release";
          case "rfa":
          case "ufa":
          case "expired":
          case "expiry":
            return "Contract expired";
          default:
            return "Dropped";
        }
      };
      const missingHistory = (label: string) =>
        recordedEnd
          ? result(
              `${endLabel(recordedEnd.status)} (contract record)`,
              recordedEnd.end,
            )
          : result(label);
      // The contract records the transaction date; roster snapshots can end
      // earlier than an in-season buyout.
      if (recordedEnd?.status?.toLowerCase() === "buyout")
        return result("Bought out", recordedEnd.end);
      const opening = rosters.get(`${pick.teamId}:${input.start}`);
      if (!opening) return missingHistory("Roster history unavailable");
      if (!opening.has(pick.playerId))
        return result("Not on opening roster", input.start);
      const limit = end < input.today ? end : input.today;
      for (
        let date = nextDay(input.start);
        date <= limit;
        date = nextDay(date)
      ) {
        const roster = rosters.get(`${pick.teamId}:${date}`);
        if (!roster) {
          // Today's snapshot may not have been imported yet.
          return date === input.today
            ? result(
                "Still rostered",
                new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000)
                  .toISOString()
                  .slice(0, 10),
              )
            : missingHistory("Roster history incomplete");
        }
        if (roster.has(pick.playerId)) continue;
        const contract = input.contracts.find(
          (entry) =>
            entry.playerId === pick.playerId &&
            entry.start &&
            entry.start <= input.start! &&
            entry.end &&
            (entry.end === date || nextDay(entry.end) === date),
        );
        return result(endLabel(contract?.status), contract?.end ?? date);
      }
      return end < input.today
        ? result("Full season", end)
        : result("Still rostered", limit);
    }),
  );
}
