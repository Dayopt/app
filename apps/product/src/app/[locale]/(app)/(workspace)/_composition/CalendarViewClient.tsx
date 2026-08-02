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
import { useCallback, useMemo } from 'react';

import { FeatureErrorBoundary } from '@/components/ui/feedback/error-boundary';
import {
  CalendarCompareToggle,
  CalendarController,
  isCalendarDiffView,
  useCalendarNavigation,
} from '@/features/calendar';
import { CalendarReviewPanel, ReviewDiffPanel, useReviewOpenedTracking } from '@/features/review';
import { useShellStore } from '@/lib/stores/useShellStore';
import { Button, HoverTooltip } from '@dayopt/components';
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
  const handleReviewPanelToggle = useCallback(() => {
    setPanelKind(panelKind === 'review' || panelKind === 'analytics' ? null : 'review');
  }, [panelKind, setPanelKind]);
  const handleCompareToggle = useCallback(
    (checked: boolean) => {
      setPanelKind(checked ? 'diff' : null);
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
  const isReviewPanelActive = panelKind === 'review' || panelKind === 'analytics';
  const isDiffPanelActive = panelKind === 'diff';
  useReviewOpenedTracking(isReviewPanelActive);
  const reviewDisplayRange = useMemo(
    () => ({
      ...composition.viewDateRange,
      showWeekends: composition.showWeekends,
    }),
    [composition.showWeekends, composition.viewDateRange],
  );
  const reviewToggle = (
    <HoverTooltip content={t('calendar.stats.review.tooltip')} side="bottom">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        icon
        className={
          isReviewPanelActive
            ? 'bg-state-selected text-foreground hover:bg-state-selected'
            : 'text-muted-foreground hover:text-foreground'
        }
        aria-label={t('calendar.stats.review.ariaLabel')}
        aria-pressed={isReviewPanelActive}
        onClick={handleReviewPanelToggle}
      >
        <ChartNoAxesColumnIncreasing className="size-4" />
      </Button>
    </HoverTooltip>
  );
  const compareToggle = (
    <>
      <CalendarCompareToggle
        checked={isDiffPanelActive}
        onCheckedChange={handleCompareToggle}
        className="-mr-2 hidden md:flex"
      />
      <CalendarCompareToggle
        checked={isDiffPanelActive}
        onCheckedChange={handleCompareToggle}
        className="md:hidden"
      />
    </>
  );
  const headerActions = (
    <>
      {reviewToggle}
      {compareToggle}
      <ConnectedMobileAccountButton className="md:hidden" />
    </>
  );
  const reviewPanel = (
    <CalendarReviewPanel
      currentDate={currentDate}
      displayRange={reviewDisplayRange}
      selectedTagId={reviewTagId}
      onSelectedTagIdChange={setReviewTagId}
      onClose={() => setPanelKind(null)}
    />
  );
  const mobileReviewPanel = (
    <CalendarReviewPanel
      currentDate={currentDate}
      displayRange={reviewDisplayRange}
      selectedTagId={reviewTagId}
      onSelectedTagIdChange={setReviewTagId}
      onClose={() => setPanelKind(null)}
      variant="sheet"
    />
  );
  const panelRail = isReviewPanelActive ? reviewPanel : null;
  const mobilePanelRail = isReviewPanelActive ? mobileReviewPanel : null;
  const panelRailOpen = isReviewPanelActive;
  const panelRailTitle = t('calendar.views.stats');
  const panelRailDescription = t('calendar.stats.review.description');

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
          onCompareRailOpenChange={(open) => setPanelKind(open ? 'diff' : null)}
          renderCompareRail={({ diff, variant, onItemClick, onClose }) => (
            <ReviewDiffPanel
              diff={diff}
              variant={variant}
              onItemClick={onItemClick}
              onClose={onClose}
            />
          )}
          panelRail={panelRail}
          mobilePanelRail={mobilePanelRail}
          panelRailOpen={panelRailOpen}
          onPanelRailOpenChange={(open) => {
            if (open) return;
            setPanelKind(null);
          }}
          panelRailTitle={panelRailTitle}
          panelRailDescription={panelRailDescription}
          recoverableSidebarWidth={sidebar.open ? sidebar.width : 0}
          onSideRailSpaceRecoveryChange={handleSideRailSpaceRecoveryChange}
        />
      </FeatureErrorBoundary>
    </div>
  );
}
