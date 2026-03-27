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

import { PanelLeft } from 'lucide-react';

import { FeatureErrorBoundary } from '@/components/common/error-boundary';
import { CalendarController, useCalendarNavigation } from '@/features/calendar';
import { useShellStore } from '@/shell/stores/useShellStore';
import { useCalendarComposition } from './useCalendarComposition';

interface CalendarViewClientProps {
  translations: {
    errorTitle: string;
    errorMessage: string;
    reloadButton: string;
  };
}

export function CalendarViewClient({ translations }: CalendarViewClientProps) {
  const calendarNavigation = useCalendarNavigation();
  const sidebar = useShellStore.use.sidebar();
  const toggleSidebar = useShellStore.use.toggleSidebar();

  // CalendarNavigationProvider は base-layout-content.tsx で常にレンダリングされるため、
  // calendarNavigation は常に利用可能。
  if (!calendarNavigation) {
    throw new Error(
      'CalendarViewClient requires CalendarNavigationProvider. ' +
        'Ensure it is rendered in the component tree.',
    );
  }

  const { viewType, currentDate, navigateRelative, changeView, navigateToDate } =
    calendarNavigation;

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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <FeatureErrorBoundary
        featureName="calendar"
        fallback={
          <div className="flex h-full items-center justify-center p-4">
            <div className="border-destructive max-w-md rounded-2xl border p-6">
              <div className="text-center">
                <div className="mb-4 text-6xl">📅</div>
                <h2 className="text-destructive mb-2 text-2xl font-bold tracking-tight">
                  {translations.errorTitle}
                </h2>
                <p className="text-muted-foreground mb-4 text-sm">{translations.errorMessage}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="bg-primary text-primary-foreground rounded px-4 py-2 transition-opacity hover:opacity-80"
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
          disabledEntryId={composition.disabledPlanId}
          onEntryClick={composition.onPlanClick}
          onTimeRangeSelect={composition.onTimeRangeSelect}
          onUpdateEntry={composition.onUpdatePlan}
          onDeleteEntry={composition.onDeletePlan}
          getAddToPaletteHandler={composition.getAddToPaletteHandler}
          onDeleteEntryConfirm={composition.onDeletePlanConfirm}
          onNavigate={composition.onNavigate}
          onViewChange={composition.onViewChange}
          onNavigatePrev={composition.onNavigatePrev}
          onNavigateNext={composition.onNavigateNext}
          onNavigateToday={composition.onNavigateToday}
          onToggleWeekends={composition.onToggleWeekends}
          onSettingsChange={composition.onSettingsChange}
          onDateSelect={composition.onDateSelect}
          leftSlot={sidebarToggle}
        />
      </FeatureErrorBoundary>
    </div>
  );
}
