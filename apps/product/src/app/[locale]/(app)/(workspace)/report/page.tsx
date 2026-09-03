import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import type { Locale } from '@dayopt/i18n/routing';

import { ReportViewClient } from '../_composition/ReportViewClient';
import { parseReportRangeParam } from '../_server/calendar-page-params';

/**
 * `/report` — 4 章構成の 1 スクロールページ（#2575）。
 *
 * server prefetch はしない。期間の解決がユーザーの timezone と週開始曜日に依存するため、
 * サーバー（UTC）で組むと非 UTC ユーザーの週境界がずれる。`date` は文字列のまま
 * Composition Layer へ渡し、Date への変換は client 側で行う。
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

const ANCHOR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const ReportPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; range?: string }>;
}) => {
  const { date, range } = await searchParams;

  return (
    <ReportViewClient
      anchorDate={date !== undefined && ANCHOR_DATE_PATTERN.test(date) ? date : undefined}
      granularity={parseReportRangeParam(range)}
    />
  );
};

export default ReportPage;
