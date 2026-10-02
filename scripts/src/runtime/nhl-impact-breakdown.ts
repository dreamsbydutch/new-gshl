import type { ImpactModel } from "./nhl-adjusted-impact";

/** Goal units, relative to the fitted strength-state baseline. Positive defense prevents goals. */
export function impactBreakdown(
  model: Pick<ImpactModel, "coefficients">,
  playerId: number,
  situations: Readonly<Record<string, number>>,
) {
  let offense = 0,
    defense = 0;
  const byStrength: Record<
    string,
    { minutes: number; offense: number; defense: number }
  > = {};
  for (const [situation, minutes] of Object.entries(situations)) {
    const match = /^(\d+)v(\d+):([GE])([GE])$/.exec(situation);
    if (!match || !Number.isFinite(minutes) || minutes < 0)
      throw new Error(`Invalid impact exposure: ${situation}`);
    const family =
      match[3] !== "G" || match[4] !== "G"
        ? "EN"
        : Number(match[1]) > Number(match[2])
          ? "PP"
          : Number(match[1]) < Number(match[2])
            ? "SH"
            : "EV";
    const o = model.coefficients[`O:${family}:${playerId}`] ?? 0;
    const d = model.coefficients[`D:${family}:${playerId}`] ?? 0;
    if (!Number.isFinite(o) || !Number.isFinite(d))
      throw new Error("Nonfinite impact coefficient");
    const row = byStrength[family] ?? { minutes: 0, offense: 0, defense: 0 };
    row.minutes += minutes;
    row.offense += (o * minutes) / 60;
    row.defense -= (d * minutes) / 60;
    offense += (o * minutes) / 60;
    defense -= (d * minutes) / 60;
    byStrength[family] = row;
  }
  return { offense, defense, total: offense + defense, byStrength };
}
