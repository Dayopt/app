'use client';

import { CalendarDays, PanelLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';

import { formatCalendarDateParam, useCalendarNavigation } from '@/features/calendar';
import {
  ReportBody,
  ReportHeader,
  resolveReportRange,
  shiftReportAnchor,
  todayReportAnchor,
  type ReportGranularity,
} from '@/features/review';
import { useHasMounted } from '@/lib/hooks/useHasMounted';
import { useUserPreferences } from '@/lib/hooks/useUserPreferences';
import { useShellStore } from '@/lib/stores/useShellStore';
import { Button, Skeleton } from '@dayopt/components';
import { Link, useRouter } from '@dayopt/i18n/navigation';

import { ConnectedMobileAccountButton } from '../../_shell/MobileAccountButton';

interface ReportViewClientProps {
  /**
   * `?date=` の値（`YYYY-MM-DD`）。期間を含む任意の日。
   *
   * 省略時はユーザーの timezone での「今日」を使う。既定値の解決を client でやるのは、
   * サーバー（UTC）で `new Date()` を取ると非 UTC ユーザーの日付が 1 日ずれるため。
   */
  anchorDate?: string | undefined;
  granularity: ReportGranularity;
}

/**
 * ReportViewClient - `/report` の Composition Bridge
 *
 * `features/review` は同層の `features/calendar` を import できないため、期間ナビの配線
 * （`useCalendarNavigation`）とルーティング（`useRouter`）をここが担う。review 側は
 * props のコールバックで受ける。
 *
 * `/report` は `hasOwnHeader` 扱い（`_shell/desktop-layout.tsx`）なので、shell が出していた
 * サイドバートグルとモバイルのアカウントボタンもここから `ReportHeader` の slot へ渡す
 * （`CalendarViewClient` が `CalendarLayout` に渡しているのと同じ形）。
 */
export function ReportViewClient({
  anchorDate: anchorDateParam,
  granularity,
}: ReportViewClientProps) {
  const t = useTranslations();
  const router = useRouter();
  const navigation = useCalendarNavigation();
  const timezone = useUserPreferences((s) => s.timezone);
  const weekStartsOn = useUserPreferences((s) => s.weekStartsOn);
  const sidebar = useShellStore.use.sidebar();
  const toggleSidebar = useShellStore.use.toggleSidebar();

  // `?date=` が無いときの既定は「ユーザーの timezone での今日」だが、その timezone は
  // client でしか分からない（SSR の `useUserPreferences` は UTC にフォールバックする）。
  // サーバーの HTML と client の初回描画で日付がずれるとハイドレーションが壊れるため、
  // 既定を使う経路だけマウント後まで描画を遅らせる。URL に日付があれば両者は一致するので
  // 遅らせない。
  const hasMounted = useHasMounted();
  const anchorDate = anchorDateParam ?? todayReportAnchor(timezone);

  const range = useMemo(
    () => resolveReportRange(anchorDate, granularity, timezone, weekStartsOn),
    [anchorDate, granularity, timezone, weekStartsOn],
  );

  /**
   * 期間の移動。
   *
   * `navigateRelative` は使わない（calendar の viewType 基準で動くため、レポートの粒度と
   * 食い違う）。日付は必ず `navigateToDate` 経由で書く — review が独自に history を触ると
   * `CalendarNavigationContext` が stale になり、`WorkspaceTabs` がタブ往復で古い日付を組む。
   */
  const handleNavigate = useCallback(
    (direction: 'prev' | 'next' | 'today') => {
      const nextAnchor =
        direction === 'today'
          ? todayReportAnchor(timezone)
          : shiftReportAnchor(anchorDate, granularity, direction === 'next' ? 1 : -1);

      navigation?.navigateToDate(parseAnchorToLocalDate(nextAnchor), true);
    },
    [anchorDate, granularity, navigation, timezone],
  );

  const handleGranularityChange = useCallback(
    (next: ReportGranularity) => {
      router.push(`/report?date=${anchorDate}&range=${next}`);
    },
    [anchorDate, router],
  );

  // Sidebar は desktop 専用。閉じている時だけトグルを出す（shell の実装と同じ条件）。
  const sidebarToggle = !sidebar.open ? (
    <Button
      type="button"
      variant="ghost"
      icon
      size="sm"
      onClick={toggleSidebar}
      aria-label="Open sidebar"
      className="hidden md:inline-flex"
    >
      <PanelLeft className="size-4" />
    </Button>
  ) : null;

  // モバイルのワークスペース切替（#2300 でフッターの BottomTabBar を置き換えたもの）。
  // 現在地ではなく遷移先（カレンダー）を示すアイコンで、日付を引き継ぐ。
  const calendarHref = navigation
    ? `/calendar?view=${navigation.viewType}&date=${formatCalendarDateParam(navigation.currentDate)}`
    : '/calendar';

  const mobileActions = (
    <div className="flex h-8 items-center gap-1 md:hidden">
      <Button
        variant="ghost"
        icon
        size="sm"
        className="text-muted-foreground hover:text-foreground"
        asChild
      >
        <Link href={calendarHref} aria-label={t('calendar.actions.openCalendar')}>
          <CalendarDays className="size-5" />
        </Link>
      </Button>
      <ConnectedMobileAccountButton />
    </div>
  );

  if (anchorDateParam === undefined && !hasMounted) {
    return (
      <div className="flex h-full flex-col gap-4 p-4 md:p-6">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ReportHeader
        periodStart={parseAnchorToLocalDate(range.buckets[0]?.key ?? anchorDate)}
        periodEnd={parseAnchorToLocalDate(
          range.buckets[range.buckets.length - 1]?.key ?? anchorDate,
        )}
        granularity={granularity}
        weekStartsOn={weekStartsOn}
        onNavigate={handleNavigate}
        onGranularityChange={handleGranularityChange}
        leftSlot={sidebarToggle}
        rightSlot={mobileActions}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ReportBody anchorDate={anchorDate} granularity={granularity} />
      </div>
    </div>
  );
}

/**
 * `YYYY-MM-DD` を壁時計の Date として読む。
 *
 * 期間ラベルと `navigateToDate` はローカル日付の Date を期待するため、時刻としては
 * 再解釈せず年月日の成分だけを使う。
 */
function parseAnchorToLocalDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}
