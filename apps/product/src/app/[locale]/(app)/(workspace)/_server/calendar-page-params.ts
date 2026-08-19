import { getTranslations } from 'next-intl/server';

import type { CalendarViewType, MultiDayViewType } from '@/features/calendar';
import { parseCalendarDateParam } from '@/features/calendar';
import type { ReviewGranularity } from '@/features/review';
import type { Locale } from '@dayopt/i18n/routing';

/**
 * searchParams から日付を解析する
 */
export function parseDateParam(date: string | undefined): Date | undefined {
  return parseCalendarDateParam(date);
}

/** URL segmentをサポート対象のmulti-day view（2day〜7day）として解析する。 */
export function parseMultiDayViewParam(nday: string): MultiDayViewType | null {
  return /^[2-7]day$/.test(nday) ? (nday as MultiDayViewType) : null;
}

/**
 * `/calendar?view=` の値を CalendarViewType として解析する。
 *
 * `view` 省略時（undefined）は呼び出し側で week として扱う（呼び出し側の責務）。
 * 値が指定されていて day/week/2〜7day のいずれにも一致しない場合のみ null を返し、
 * 呼び出し側で 404 にする（範囲外は redirect せず 404 のまま、という現行 [nday] の
 * 挙動を維持するため）。
 */
export function parseCalendarViewParam(view: string | undefined): CalendarViewType | null {
  if (view === undefined) return null;
  if (view === 'day' || view === 'week') return view;
  return parseMultiDayViewParam(view);
}

/**
 * `/report?range=` の値を ReviewGranularity として解析する（overview.md §6-3）。
 * 省略時・不正値は 'week' にフォールバックする（v1 は day/week の 2 値のみ）。
 */
export function parseReportRangeParam(range: string | undefined): ReviewGranularity {
  return range === 'day' ? 'day' : 'week';
}

/**
 * カレンダービューの翻訳テキストを取得する
 */
export async function getCalendarTranslations(locale: Locale) {
  const t = await getTranslations({ locale });
  return {
    errorTitle: t('calendar.errors.loadFailed'),
    errorMessage: t('calendar.errors.displayFailed'),
    reloadButton: t('common.reload'),
  };
}
