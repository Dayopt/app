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

import { ChartNoAxesColumnIncreasing, PanelLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import {
  CalendarAnalyticsPanel,
  CalendarCompareToggle,
  CalendarController,
  useCalendarNavigation,
} from '@/features/calendar';
import { FeatureErrorBoundary } from '@/lib/components/common/error-boundary';
import { Button } from '@/lib/components/ui/button';
import { HoverTooltip } from '@/lib/components/ui/tooltip';
import { useShellStore } from '@/lib/stores/useShellStore';
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
  const toggleSidebar = useShellStore.use.toggleSidebar();
  const [analyticsPanelOpen, setAnalyticsPanelOpen] = useState(false);
  const [analyticsTagId, setAnalyticsTagId] = useState<string | null>(null);

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
    dayCompareEnabled,
    setDayCompareEnabled,
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

  // サイドバーが閉じているときに表示するトグルボタン
  const sidebarToggle = !sidebar.open ? (
    <button
      type="button"
      onClick={toggleSidebar}
      className="hover:bg-state-hover flex size-8 items-center justify-center rounded-lg transition-colors"
      aria-label="Open sidebar"
    >
      <PanelLeft className="size-4" />
    </button>
  ) : null;
  const handleAnalyticsPanelToggle = useCallback(() => {
    setAnalyticsPanelOpen((open) => {
      const nextOpen = !open;
      if (nextOpen) {
        setDayCompareEnabled(false);
      }
      return nextOpen;
    });
  }, [setDayCompareEnabled]);
  const handleCompareToggle = useCallback(
    (checked: boolean) => {
      setAnalyticsPanelOpen(false);
      setDayCompareEnabled(checked);
    },
    [setDayCompareEnabled],
  );
  const analyticsToggle = (
    <HoverTooltip content={t('calendar.analysis.tooltip')} side="bottom">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        icon
        className={
          analyticsPanelOpen
            ? 'bg-state-selected text-foreground hover:bg-state-selected'
            : 'text-muted-foreground hover:text-foreground'
        }
        aria-label={t('calendar.analysis.ariaLabel')}
        aria-pressed={analyticsPanelOpen}
        onClick={handleAnalyticsPanelToggle}
      >
        <ChartNoAxesColumnIncreasing className="size-4" />
      </Button>
    </HoverTooltip>
  );
  const compareToggle =
    viewType === 'day' ? (
      <>
        <CalendarCompareToggle
          checked={dayCompareEnabled}
          onCheckedChange={handleCompareToggle}
          className="-mr-2 hidden md:flex"
        />
        <CalendarCompareToggle
          checked={dayCompareEnabled}
          onCheckedChange={handleCompareToggle}
          className="-mr-2 md:hidden"
        />
      </>
    ) : null;
  const headerActions = (
    <>
      {analyticsToggle}
      {compareToggle}
    </>
  );
  const analyticsPanel = (
    <CalendarAnalyticsPanel
      selectedTagId={analyticsTagId}
      onSelectedTagIdChange={setAnalyticsTagId}
      onClose={() => setAnalyticsPanelOpen(false)}
    />
  );

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
                <button
                  onClick={() => window.location.reload()}
                  className="bg-primary text-primary-foreground hover:bg-primary-hover rounded-lg px-4 py-2 transition-colors"
                >
                  {translations.reloadButton}
                </button>
              </div>
            </div>
          </div>
        }
      >
        <CalendarController
          viewType={viewType}
          currentDate={currentDate}
          viewDateRange={composition.viewDateRange}
          filteredEntries={composition.filteredEvents}
          allEntries={composition.allCalendarEvents}
          showWeekends={composition.showWeekends}
          showActualDiff={viewType === 'day' && dayCompareEnabled}
          disabledEntryId={composition.disabledEntryId}
          onEntryClick={composition.onEntryClick}
          onTimeRangeSelect={composition.onTimeRangeSelect}
          onUpdateEntry={composition.onUpdateEntry}
          onDeleteEntry={composition.onDeleteEntry}
          onDeleteEntryConfirm={composition.onDeleteEntryConfirm}
          onViewStats={composition.onViewStats}
          onMarkUnplanned={composition.onMarkUnplanned}
          onRestorePlanned={composition.onRestorePlanned}
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
          onCompareRailOpenChange={setDayCompareEnabled}
          analyticsRail={analyticsPanel}
          mobileAnalyticsRail={analyticsPanel}
          analyticsRailOpen={analyticsPanelOpen}
          onAnalyticsRailOpenChange={setAnalyticsPanelOpen}
        />
      </FeatureErrorBoundary>
    </div>
  );
}
