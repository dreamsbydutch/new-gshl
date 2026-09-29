// Missing source fields never erase known history. A historical re-import
// cannot roll back values subsequently observed in the live directory.
export function mergeNhlContractFields<T extends Record<string, unknown>>(
  existing: Record<string, unknown> | null,
  incoming: T,
  preserveExisting = false,
): T {
  const merged = {} as T;
  const historicalAfterLive =
    existing?.source === "puckpedia" && incoming.source === "historical-json";
  for (const key of Object.keys(incoming)) {
    const preferExisting =
      (historicalAfterLive || preserveExisting) &&
      key !== "historicalValues" &&
      key !== "historicalContractId";
    const value = preferExisting
      ? (existing?.[key] ?? incoming[key])
      : (incoming[key] ?? existing?.[key]);
    if (value === undefined) continue;
    Object.assign(merged, { [key]: value });
  }
  return merged;
}

export function changedNhlContractFields(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): boolean {
  return Object.entries(incoming).some(
    ([key, value]) => !equalValue(existing[key], value),
  );
}

function equalValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object")
    return false;
  const rightFields = right as Record<string, unknown>;
  return (
    Object.keys(left).length === Object.keys(right).length &&
    Object.entries(left).every(
      ([key, value]) =>
        Object.hasOwn(rightFields, key) && equalValue(value, rightFields[key]),
    )
  );
}
