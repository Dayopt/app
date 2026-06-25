import type { ReviewGranularity } from '../stores/useReviewFilterStore';

export function parseReviewGranularityParam(
  value: string | undefined,
): ReviewGranularity | undefined {
  return value === 'week' ? 'week' : undefined;
}

export function buildDailyReviewRedirectPath(locale: string, dateStr: string): string {
  return `/${locale}/day?date=${dateStr}&compare=1`;
}

export function buildWeeklyTagDetailPath(locale: string, tagId: string, dateStr: string): string {
  return `/${locale}/review/tags/${tagId}?g=week&d=${dateStr}`;
}
