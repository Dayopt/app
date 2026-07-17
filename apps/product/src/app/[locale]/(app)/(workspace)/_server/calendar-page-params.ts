import { getTranslations } from 'next-intl/server';

import type { MultiDayViewType } from '@/features/calendar';
import { parseCalendarDateParam } from '@/features/calendar';
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
