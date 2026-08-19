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

import { FeatureErrorBoundary } from '@/components/ui/feedback/error-boundary';
import { CalendarController, isCalendarDiffView, useCalendarNavigation } from '@/features/calendar';
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

  const { viewType, currentDate, panelKind, navigateRelative, changeView, navigateToDate } =
    calendarNavigation;

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
  // カレンダー内 review/diff パネル（CalendarReviewRail）は廃止済み（#2181 Step 4）。
  // panelKind='diff' の URL（旧 ?panel=diff）は Step 6 の redirect 実測まで読み取りだけ残る
  // ため、グリッド上の diff ハイライトだけは維持する（トグル UI 自体は無い）。
  const showActualDiff = panelKind === 'diff' && isCalendarDiffView(viewType);

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
          showActualDiff={showActualDiff}
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
          rightSlot={<ConnectedMobileAccountButton className="md:hidden" />}
        />
      </FeatureErrorBoundary>
    </div>
  );
}
