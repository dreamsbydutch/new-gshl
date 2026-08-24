import type {
  WeeklyEditionArticleCount,
  WeeklyEditionArticleId,
} from "@gshl-types";

export const WEEKLY_EDITION_ARTICLE_COUNT_OPTIONS = [
  6, 7, 8, 9, 10,
] as const satisfies readonly WeeklyEditionArticleCount[];

export const DEFAULT_WEEKLY_EDITION_ARTICLE_COUNT: WeeklyEditionArticleCount = 8;

export const MIN_WEEKLY_EDITION_ARTICLE_COUNT: WeeklyEditionArticleCount = 6;

export const MAX_WEEKLY_EDITION_ARTICLE_COUNT: WeeklyEditionArticleCount = 10;

export function isWeeklyEditionArticleCount(
  value: unknown,
): value is WeeklyEditionArticleCount {
  return (
    typeof value === "number" &&
    WEEKLY_EDITION_ARTICLE_COUNT_OPTIONS.some((option) => option === value)
  );
}

export function parseWeeklyEditionArticleCount(
  value: unknown,
): WeeklyEditionArticleCount {
  const count = Number(value);
  if (!isWeeklyEditionArticleCount(count)) {
    throw new Error(
      `Newsletter story count must be between ${MIN_WEEKLY_EDITION_ARTICLE_COUNT} and ${MAX_WEEKLY_EDITION_ARTICLE_COUNT}`,
    );
  }
  return count;
}

export function weeklyEditionArticleSlot(index: number):
  | {
      id: WeeklyEditionArticleId;
      kind: "primary_article" | "standard_article";
    }
  | undefined {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= MAX_WEEKLY_EDITION_ARTICLE_COUNT
  ) {
    return undefined;
  }
  return {
    id: `article_${index + 1}` as WeeklyEditionArticleId,
    kind: index < 2 ? "primary_article" : "standard_article",
  };
}

export function buildWeeklyEditionArticleSlots(
  articleCount: WeeklyEditionArticleCount,
) {
  return Array.from({ length: articleCount }, (_, index) =>
    weeklyEditionArticleSlot(index),
  ).filter((slot): slot is NonNullable<typeof slot> => Boolean(slot));
}
