/** A display clock that keeps days/hours visible before the draft starts. */
export function formatDraftTvClock(totalSeconds: number): string {
  const total = Number.isFinite(totalSeconds)
    ? Math.max(0, Math.floor(totalSeconds))
    : 0;
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${days ? `${days}d ` : ""}${days || hours ? `${pad(hours)}:` : ""}${pad(minutes)}:${pad(seconds)}`;
}
