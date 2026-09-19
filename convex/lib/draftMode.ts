/** Only consecutive clock timeouts enable persistent Auto mode. */
export function nextDraftMode(
  team: { draftAuto?: boolean; draftTimeoutStreak?: number },
  timedOut: boolean,
) {
  const draftTimeoutStreak = timedOut ? (team.draftTimeoutStreak ?? 0) + 1 : 0;
  return {
    draftTimeoutStreak,
    draftAuto: Boolean(team.draftAuto) || draftTimeoutStreak >= 2,
  };
}
