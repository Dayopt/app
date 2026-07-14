import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { HydrationBoundary } from '@/lib/trpc/server';
import type { Locale } from '@dayopt/i18n/routing';

import { CalendarViewClient } from '../_composition/CalendarViewClient';
import { prefetchCalendarData } from '../_server/calendar-prefetch';
import { CalendarSkeleton } from '../_server/CalendarSkeleton';
import { getCalendarTranslations, parseDateParam } from '../_server/page-utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale?: Locale }>;
}): Promise<Metadata> {
  const { locale = 'ja' } = await params;
  const t = await getTranslations({ locale, namespace: 'calendar' });
  return {
    title: t('views.week'),
    description: t('meta.description'),
  };
}

async function WeekPageContent({ locale, date }: { locale: Locale; date: string | undefined }) {
  const initialDate = parseDateParam(date);
  const targetDate = initialDate ?? new Date();
  const translations = await getCalendarTranslations(locale);
  const { dehydratedState } = await prefetchCalendarData('week', targetDate);

  return (
    <HydrationBoundary state={dehydratedState}>
      <CalendarViewClient translations={translations} />
    </HydrationBoundary>
  );
}

const WeekPage = async ({
  params,
  searchParams,
}: {
  params: Promise<{ locale?: Locale }>;
  searchParams: Promise<{ date?: string }>;
}) => {
  const { locale = 'ja' } = await params;
  const { date } = await searchParams;

  return (
    <Suspense fallback={<CalendarSkeleton />}>
      <WeekPageContent locale={locale} date={date} />
    </Suspense>
  );
};

export default WeekPage;
