export interface FrontendIndexPlan {
  indexName: string;
  constrainedFields: string[];
}

/**
 * Selects the index whose leading fields are most fully constrained by a
 * generic browser query. Convex permits equality constraints on a compound
 * index prefix, so season + week requests can avoid scanning an entire season.
 */
export function selectFrontendIndexPlan(
  indexes: readonly (readonly string[])[],
  where: Readonly<Record<string, unknown>>,
  nonExactFields: ReadonlySet<string> = new Set(),
): FrontendIndexPlan | null {
  let best: FrontendIndexPlan | null = null;
  let bestIndexWidth = Number.POSITIVE_INFINITY;

  for (const fields of indexes) {
    const constrainedFields: string[] = [];
    for (const field of fields) {
      if (where[field] === undefined || nonExactFields.has(field)) break;
      constrainedFields.push(field);
    }
    if (!constrainedFields.length) continue;

    if (
      !best ||
      constrainedFields.length > best.constrainedFields.length ||
      (constrainedFields.length === best.constrainedFields.length &&
        fields.length < bestIndexWidth)
    ) {
      best = {
        indexName: `by_${fields.join("_")}`,
        constrainedFields,
      };
      bestIndexWidth = fields.length;
    }
  }

  return best;
}

export function canTakeFrontendRowsBeforeFiltering(
  where: Readonly<Record<string, unknown>>,
  plan: FrontendIndexPlan | null,
): boolean {
  const constrained = new Set(plan?.constrainedFields ?? []);
  return Object.entries(where).every(
    ([field, value]) => value === undefined || constrained.has(field),
  );
}
