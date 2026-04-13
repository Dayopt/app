import { getTranslations } from 'next-intl/server';

import { parseCalendarDateParam } from '@/features/calendar';
import type { Locale } from '@/lib/i18n/routing';

/**
 * searchParams から日付を解析する
 */
export function parseDateParam(date: string | undefined): Date | undefined {
  return parseCalendarDateParam(date);
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
