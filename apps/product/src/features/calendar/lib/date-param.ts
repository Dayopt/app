import { getDateKey } from '@/lib/date';

const DATE_PARAM_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * YYYY-MM-DD 形式の日付パラメータをローカル日付として解釈する。
 *
 * `new Date('YYYY-MM-DD')` はUTC解釈されるため、
 * タイムゾーンによって前日/翌日にずれる問題を避ける。
 */
export function parseCalendarDateParam(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;

  const match = DATE_PARAM_PATTERN.exec(value);
  if (!match) return undefined;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);

  // 正午で保持し、DST境界やUTC変換で日付が前後しにくい基準値にする。
  const parsed = new Date(year, monthIndex, day, 12, 0, 0, 0);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== monthIndex ||
    parsed.getDate() !== day
  ) {
    return undefined;
  }

  return parsed;
}

export function formatCalendarDateParam(date: Date): string {
  return getDateKey(date);
}
