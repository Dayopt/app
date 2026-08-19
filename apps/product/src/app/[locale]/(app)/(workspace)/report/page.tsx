import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import type { Locale } from '@dayopt/i18n/routing';

import { ReportViewClient } from '../_composition/ReportViewClient';
import { parseDateParam, parseReportRangeParam } from '../_server/calendar-page-params';

/**
 * `/report` — 1 スクロール構成のフルページ（overview.md §6-1・Step 4）。
 *
 * server prefetch はしない（§6-9 #3。`days` の組み立てがローカル TZ の getter に
 * 依存するため、サーバー（UTC）で組むと非 UTC ユーザーの週境界がずれる）。
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale?: Locale }>;
}): Promise<Metadata> {
  const { locale = 'ja' } = await params;
  const t = await getTranslations({ locale });

  return {
    title: t('sidebar.pageNav.report'),
    description: t('calendar.meta.description'),
  };
}

const ReportPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; range?: string }>;
}) => {
  const { date, range } = await searchParams;
  const targetDate = parseDateParam(date) ?? new Date();
  const targetRange = parseReportRangeParam(range);

  return <ReportViewClient date={targetDate} range={targetRange} />;
};

export default ReportPage;
