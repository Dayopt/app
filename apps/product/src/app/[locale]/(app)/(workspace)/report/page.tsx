import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import type { Locale } from '@dayopt/i18n/routing';

import { ReportViewClient } from '../_composition/ReportViewClient';
import { parseReportRangeParam } from '../_server/calendar-page-params';

/**
 * `/report` — 4 章構成の 1 スクロールページ（#2575）。
 *
 * server prefetch はしない。期間の解決がユーザーの timezone と週開始曜日に依存するため、
 * サーバー（UTC）で組むと非 UTC ユーザーの週境界がずれる。
 *
 * **`?date=` はここで読まない。** 表示中の日付は `CalendarNavigationContext` が URL から
 * 読んで保持し、`‹ ›` の移動もそこへ書く（`history.replaceState` 直書きなので server
 * component は再描画されない）。`date` を prop で渡すと期間移動が画面に反映されなくなる。
 * ここが受け取るのは、Context が持たない `range` だけ。
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

const ReportPage = async ({ searchParams }: { searchParams: Promise<{ range?: string }> }) => {
  const { range } = await searchParams;

  return <ReportViewClient granularity={parseReportRangeParam(range)} />;
};

export default ReportPage;
