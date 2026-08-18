'use client';

/**
 * CalendarViewClient - Composition Bridge
 *
 * ナビゲーション状態を管理し、useCalendarCompositionを呼び出して
 * CalendarControllerにデータとコールバックをpropsで渡すブリッジコンポーネント。
 *
 * CalendarController自体はpure view（@/features/* importゼロ）。
 * cross-feature依存の橋渡しはこのファイルが担当する。
 */

import { isWeekend } from 'date-fns';
import { PanelLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';

import { FeatureErrorBoundary } from '@/components/ui/feedback/error-boundary';
import {
  CalendarController,
  CalendarPanelToggle,
  isCalendarDiffView,
  useCalendarNavigation,
} from '@/features/calendar';
import { CalendarReviewRail, useReviewOpenedTracking } from '@/features/review';
import { useShellStore } from '@/lib/stores/useShellStore';
import { Button } from '@dayopt/components';
import { ConnectedMobileAccountButton } from '../../_shell/MobileAccountButton';
import { useCalendarComposition } from './useCalendarComposition';

interface CalendarViewClientProps {
  translations: {
    errorTitle: string;
    errorMessage: string;
    reloadButton: string;
  };
}

export function CalendarViewClient({ translations }: CalendarViewClientProps) {
  const t = useTranslations();
  const calendarNavigation = useCalendarNavigation();
  const sidebar = useShellStore.use.sidebar();
  const suppressSidebar = useShellStore.use.suppressSidebar();
  const restoreSidebar = useShellStore.use.restoreSidebar();
  const toggleSidebar = useShellStore.use.toggleSidebar();

  // CalendarNavigationProvider は base-layout-content.tsx で常にレンダリングされるため、
  // calendarNavigation は常に利用可能。
  if (!calendarNavigation) {
    throw new Error(
      'CalendarViewClient requires CalendarNavigationProvider. ' +
        'Ensure it is rendered in the component tree.',
    );
  }

  const {
    viewType,
    currentDate,
    panelKind,
    reviewTagId,
    setPanelKind,
    setReviewTagId,
    navigateRelative,
    changeView,
    navigateToDate,
  } = calendarNavigation;

  // Composition: 全cross-featureデータとコールバックを集約
  const composition = useCalendarComposition({
    viewType,
    currentDate,
    navigateRelative,
    navigateToDate,
    changeView,
  });

  // Sidebar は desktop 専用。mobile は header action と tag footer だけにする。
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
  const handlePanelTabSelect = useCallback(
    (tab: 'review' | 'diff') => {
      setPanelKind(tab);
    },
    [setPanelKind],
  );
  const handleSideRailSpaceRecoveryChange = useCallback(
    (recovering: boolean) => {
      if (recovering) {
        suppressSidebar();
        return;
      }

      restoreSidebar();
    },
    [restoreSidebar, suppressSidebar],
  );
  // panelKind は CalendarNavigationContext の読み取り時点で 'analytics'→'review' に正規化済みのため、
  // ここでは 'review' のみを見ればよい（旧 'analytics' 分岐は #2161 P3 でデッドブランチとして整理）
  const isReviewPanelActive = panelKind === 'review';
  const isDiffPanelActive = panelKind === 'diff';
  const activePanelTab: 'review' | 'diff' | null = isDiffPanelActive
    ? 'diff'
    : isReviewPanelActive
      ? 'review'
      : null;
  // CalendarController の calendarDiffEnabled と同じ判定式を揃える（週末のみ表示中の多日ビューでは
  // diffデータが空になるため、タブ自体を disabled にする。#2161 P2 の縁ケース修正）
  const calendarDiffDays = composition.showWeekends
    ? composition.viewDateRange.days
    : composition.viewDateRange.days.filter((day) => !isWeekend(day));
  const diffTabDisabled =
    !isCalendarDiffView(viewType) || (viewType !== 'day' && calendarDiffDays.length === 0);
  const panelOpen = activePanelTab !== null;
  useReviewOpenedTracking(isReviewPanelActive);
  const reviewDisplayRange = useMemo(
    () => ({
      ...composition.viewDateRange,
      showWeekends: composition.showWeekends,
    }),
    [composition.showWeekends, composition.viewDateRange],
  );
  const panelToggle = (
    <CalendarPanelToggle
      activeTab={activePanelTab}
      onSelect={handlePanelTabSelect}
      diffDisabled={diffTabDisabled}
    />
  );
  const headerActions = (
    <>
      {panelToggle}
      <ConnectedMobileAccountButton className="md:hidden" />
    </>
  );
  const panelTitle = t('calendar.views.stats');
  const panelDescription = t('calendar.stats.review.description');

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <FeatureErrorBoundary
        featureName="calendar"
        fallback={
          <div className="flex h-full items-center justify-center p-4">
            <div className="border-destructive max-w-md rounded-2xl border p-6">
              <div className="text-center">
                <div className="mb-4 text-6xl">📅</div>
                <h2 className="text-destructive mb-2 text-2xl font-medium tracking-tight">
                  {translations.errorTitle}
                </h2>
                <p className="text-muted-foreground mb-4 text-sm">{translations.errorMessage}</p>
                <Button onClick={() => window.location.reload()}>
                  {translations.reloadButton}
                </Button>
              </div>
            </div>
          </div>
        }
      >
        <CalendarController
          viewType={viewType}
          currentDate={currentDate}
          viewDateRange={composition.viewDateRange}
          filteredTimeblocks={composition.filteredEvents}
          allTimeblocks={composition.allCalendarEvents}
          externalEvents={composition.externalEvents}
          showWeekends={composition.showWeekends}
          showActualDiff={isDiffPanelActive && isCalendarDiffView(viewType)}
          disabledTimeblockId={composition.disabledTimeblockId}
          onEntryClick={composition.onEntryClick}
          onTimeRangeSelect={composition.onTimeRangeSelect}
          onUpdateEntry={composition.onUpdateEntry}
          onDeleteTimeblock={composition.onDeleteTimeblock}
          onDeleteTimeblockConfirm={composition.onDeleteTimeblockConfirm}
          onViewStats={composition.onViewStats}
          onCopy={composition.onCopy}
          onSkip={composition.onSkip}
          onUnskip={composition.onUnskip}
          onNavigate={composition.onNavigate}
          onViewChange={composition.onViewChange}
          onNavigatePrev={composition.onNavigatePrev}
          onNavigateNext={composition.onNavigateNext}
          onNavigateToday={composition.onNavigateToday}
          onToggleWeekends={composition.onToggleWeekends}
          onSettingsChange={composition.onSettingsChange}
          onDateSelect={composition.onDateSelect}
          onPrefetch={composition.prefetchDirection}
          leftSlot={sidebarToggle}
          rightSlot={headerActions}
          panelOpen={panelOpen}
          onPanelOpenChange={(open) => {
            if (open) return;
            setPanelKind(null);
          }}
          renderPanelRail={({ diff, variant, onDiffItemClick, onClose }) => (
            <CalendarReviewRail
              activeTab={activePanelTab ?? 'review'}
              onTabChange={handlePanelTabSelect}
              diffTabDisabled={diffTabDisabled}
              currentDate={currentDate}
              displayRange={reviewDisplayRange}
              selectedTagId={reviewTagId}
              onSelectedTagIdChange={setReviewTagId}
              diff={diff}
              onDiffItemClick={onDiffItemClick}
              variant={variant}
              onClose={onClose}
            />
          )}
          panelTitle={panelTitle}
          panelDescription={panelDescription}
          recoverableSidebarWidth={sidebar.open ? sidebar.width : 0}
          onSideRailSpaceRecoveryChange={handleSideRailSpaceRecoveryChange}
        />
      </FeatureErrorBoundary>
    </div>
  );
}
