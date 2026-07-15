'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';

import { usePathname } from 'next/navigation';

import { useCalendarNavigationStore } from '@/features/calendar/stores/useCalendarNavigationStore';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';

import { formatCalendarDateParam, parseCalendarDateParam } from '../../lib/date-param';
import { isCalendarViewPath } from '../../lib/route-utils';
import type { CalendarViewType } from '../../types/calendar.types';
import { getMultiDayCount, isCalendarDiffView, isMultiDayView } from '../../types/calendar.types';

type CalendarPanelKind = 'review' | 'diff' | 'analytics' | null;

// ── カレンダーページ判定・初期値計算（旧 useCalendarProviderProps） ──

function isValidViewType(view: string): view is CalendarViewType {
  if (['day', 'week'].includes(view)) return true;
  const match = view.match(/^(\d+)day$/);
  if (match) {
    const n = parseInt(match[1]!);
    return n >= 2 && n <= 9;
  }
  return false;
}

/** モバイルで提供する表示。Weekはレーン切替で密度を確保し、2〜9日は対象外とする。 */
function isMobileCalendarViewSupported(view: CalendarViewType): boolean {
  return view === 'day' || view === 'week';
}

function normalizePanelForView(
  viewType: CalendarViewType,
  panelKind: CalendarPanelKind | null,
): CalendarPanelKind | null {
  if (panelKind === 'diff') return isCalendarDiffView(viewType) ? 'diff' : null;
  return panelKind;
}

function readCalendarPanelState(viewType: CalendarViewType): {
  panelKind: CalendarPanelKind | null;
  reviewTagId: string | null;
} {
  if (typeof window === 'undefined') return { panelKind: null, reviewTagId: null };

  const params = new URLSearchParams(window.location.search);
  const rawPanel = params.get('panel');
  const requestedPanel: CalendarPanelKind | null =
    rawPanel === 'review' || rawPanel === 'diff' || rawPanel === 'analytics' ? rawPanel : null;
  const panelKind = normalizePanelForView(viewType, requestedPanel);

  return {
    panelKind,
    reviewTagId: panelKind === 'review' ? params.get('reviewTagId') : null,
  };
}

/** pathname と URL searchParams からカレンダーページ判定と初期値を計算 */
function resolveCalendarProps(pathname: string) {
  const pathWithoutLocale = pathname.replace(/^\/(ja|en)/, '');
  const isCalendar = isCalendarViewPath(pathWithoutLocale);

  if (!isCalendar) {
    return {
      isCalendarPage: false as const,
      initialDate: new Date(),
      initialView: 'week' as CalendarViewType,
    };
  }

  const pathSegments = pathname.split('/');
  const lastSegment = pathSegments[pathSegments.length - 1] ?? '';
  const view: CalendarViewType = isValidViewType(lastSegment) ? lastSegment : 'day';

  // SSR安全: window.location.search は client-only なので typeof チェック
  const dateParam =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('date') : null;
  const initialDate = parseCalendarDateParam(dateParam) ?? new Date();
  const initialPanel = readCalendarPanelState(view);

  return { isCalendarPage: true as const, initialDate, initialView: view, initialPanel };
}

interface CalendarNavigationContextValue {
  currentDate: Date;
  viewType: CalendarViewType;
  panelKind: CalendarPanelKind | null;
  reviewTagId: string | null;
  /** ナビゲーション中（日付変更・ビュー切替）のトランジション状態 */
  isPending: boolean;
  navigateToDate: (date: Date, updateUrl?: boolean) => void;
  changeView: (view: CalendarViewType) => void;
  navigateRelative: (direction: 'prev' | 'next' | 'today') => void;
  setPanelKind: (panelKind: CalendarPanelKind | null, options?: { reviewTagId?: string }) => void;
  setReviewTagId: (reviewTagId: string | null) => void;
}

const CalendarNavigationContext = createContext<CalendarNavigationContextValue | null>(null);

/**
 * カレンダーナビゲーション状態を提供するコンテキストプロバイダー
 *
 * pathname から isCalendarPage / initialDate / initialView を自動計算する。
 * 外部から useSearchParams() を渡す必要がないため、
 * 親コンポーネントの Suspense 境界を不要にする。
 */
export const CalendarNavigationProvider = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname() ?? '/';

  // pathname + window.location.search からカレンダーページ判定と初期値を計算
  const { isCalendarPage, initialDate, initialView, initialPanel } = useMemo(
    () => resolveCalendarProps(pathname),
    [pathname],
  );

  const [currentDate, setCurrentDate] = useState(initialDate);
  const [viewType, setViewType] = useState<CalendarViewType>(initialView);
  const [panelKind, setPanelKindState] = useState<CalendarPanelKind | null>(
    initialPanel?.panelKind ?? null,
  );
  const [reviewTagId, setReviewTagIdState] = useState<string | null>(
    initialPanel?.reviewTagId ?? null,
  );

  // モバイル判定（Day / Week以外の表示を制限するために使用）
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const isMobileRef = useRef(isMobile);

  // カレンダー再描画が重いため、日付・ビュー変更をtransitionとしてマーク
  // UIスレッドをブロックせず、ユーザー入力（スクロール等）を優先する
  const [isPending, startTransition] = useTransition();

  // useRefで最新値を保持し、コールバックの依存配列を安定化
  const currentDateRef = useRef(currentDate);
  const viewTypeRef = useRef(viewType);
  const panelKindRef = useRef(panelKind);
  const reviewTagIdRef = useRef(reviewTagId);
  const initialDateRef = useRef(initialDate);

  // 現在のlocaleを取得（例: /ja/day -> ja）
  const locale = pathname?.split('/')[1] || 'ja';
  const localeRef = useRef(locale);

  // ref同期 + グローバルストア同期（1つのeffectに統合）
  React.useEffect(() => {
    currentDateRef.current = currentDate;
    viewTypeRef.current = viewType;
    panelKindRef.current = panelKind;
    reviewTagIdRef.current = reviewTagId;
    localeRef.current = locale;
    isMobileRef.current = isMobile;
    // Palette等がカレンダー表示日/ビュータイプを参照するためグローバルに同期
    useCalendarNavigationStore.getState()._syncViewedDate(currentDate);
    useCalendarNavigationStore.getState()._syncViewType(viewType);
  }, [currentDate, viewType, panelKind, reviewTagId, locale, isMobile]);

  const writeCalendarUrl = useCallback(
    (
      view: CalendarViewType,
      date: Date,
      nextPanelKind: CalendarPanelKind | null,
      nextReviewTagId: string | null,
      historyMode: 'push' | 'replace',
    ) => {
      const params = new URLSearchParams(window.location.search);
      params.set('date', formatCalendarDateParam(date));
      params.delete('compare');
      params.delete('panel');
      params.delete('reviewTagId');

      const normalizedPanel = normalizePanelForView(view, nextPanelKind);
      if (normalizedPanel) {
        params.set('panel', normalizedPanel);
      }
      if (normalizedPanel === 'review' && nextReviewTagId) {
        params.set('reviewTagId', nextReviewTagId);
      } else {
        params.delete('reviewTagId');
      }

      const newUrl = `/${localeRef.current}/${view}?${params.toString()}`;
      if (historyMode === 'push') {
        window.history.pushState(null, '', newUrl);
      } else {
        window.history.replaceState(null, '', newUrl);
      }
    },
    [],
  );

  // モバイルで未対応の複数日ビューが設定された場合、dayへ切替
  // （URL直アクセスやブラウザ戻る/進むで2〜9day URLに遷移した場合のガード）
  React.useEffect(() => {
    if (isCalendarPage && isMobile && !isMobileCalendarViewSupported(viewType)) {
      startTransition(() => {
        setViewType('day');
        const nextPanelKind = normalizePanelForView('day', panelKindRef.current);
        const nextReviewTagId = nextPanelKind === 'review' ? reviewTagIdRef.current : null;
        setPanelKindState(nextPanelKind);
        setReviewTagIdState(nextReviewTagId);
      });
      // URLもday viewに更新
      writeCalendarUrl(
        'day',
        currentDateRef.current,
        panelKindRef.current,
        reviewTagIdRef.current,
        'replace',
      );
    }
  }, [isCalendarPage, isMobile, viewType, writeCalendarUrl]);

  // URL由来の initialView が変更されたら viewType を同期
  // （ブラウザ戻る/進む、直接URL入力時）
  // モバイルでは Day / Week 以外への変更を拒否（Effect A の replaceState と競合防止）
  React.useEffect(() => {
    if (isCalendarPage && initialView !== viewType) {
      if (isMobileRef.current && !isMobileCalendarViewSupported(initialView)) return;
      setViewType(initialView);
      const nextPanel = readCalendarPanelState(initialView);
      setPanelKindState(nextPanel.panelKind);
      setReviewTagIdState(nextPanel.reviewTagId);
    } else if (isCalendarPage) {
      const nextPanel = readCalendarPanelState(initialView);
      if (
        panelKindRef.current !== nextPanel.panelKind ||
        reviewTagIdRef.current !== nextPanel.reviewTagId
      ) {
        setPanelKindState(nextPanel.panelKind);
        setReviewTagIdState(nextPanel.reviewTagId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialView変更時のみ同期
  }, [isCalendarPage, initialView]);

  // URL由来の initialDate が変更されたら currentDate を同期
  // （ブラウザ戻る/進む、直接URL入力時）
  React.useEffect(() => {
    const previousInitialDate = initialDateRef.current;
    initialDateRef.current = initialDate;

    if (
      isCalendarPage &&
      initialDate.getTime() !== previousInitialDate.getTime() &&
      initialDate.getTime() !== currentDateRef.current.getTime()
    ) {
      startTransition(() => {
        setCurrentDate(initialDate);
      });
    }
  }, [isCalendarPage, initialDate, startTransition]);

  React.useEffect(() => {
    const handlePopState = () => {
      const resolved = resolveCalendarProps(window.location.pathname);
      if (!resolved.isCalendarPage) return;

      const nextView =
        isMobileRef.current && !isMobileCalendarViewSupported(resolved.initialView)
          ? 'day'
          : resolved.initialView;
      const nextPanel = readCalendarPanelState(nextView);

      startTransition(() => {
        setCurrentDate(resolved.initialDate);
        setViewType(nextView);
        setPanelKindState(nextPanel.panelKind);
        setReviewTagIdState(nextPanel.reviewTagId);
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [startTransition]);

  const navigateToDate = useCallback(
    (date: Date, updateUrl = false) => {
      startTransition(() => {
        setCurrentDate(date);
      });

      if (updateUrl) {
        // 日付変更は履歴に追加しない（replaceState）
        writeCalendarUrl(
          viewTypeRef.current,
          date,
          panelKindRef.current,
          reviewTagIdRef.current,
          'replace',
        );
      }
    },
    [writeCalendarUrl],
  );

  const changeView = useCallback(
    (view: CalendarViewType) => {
      // モバイルではDay / Weekのみ許可
      if (isMobileRef.current && !isMobileCalendarViewSupported(view)) return;
      const nextPanelKind = normalizePanelForView(view, panelKindRef.current);
      const nextReviewTagId = nextPanelKind === 'review' ? reviewTagIdRef.current : null;

      startTransition(() => {
        setViewType(view);
        setPanelKindState(nextPanelKind);
        setReviewTagIdState(nextReviewTagId);
      });
      // pushState: 即座にURL更新、サーバーナビゲーションなし
      // Next.js App Router は pushState と統合済み（usePathname等が同期する）
      writeCalendarUrl(view, currentDateRef.current, nextPanelKind, nextReviewTagId, 'push');
    },
    [writeCalendarUrl],
  );

  const setPanelKind = useCallback(
    (nextPanelKind: CalendarPanelKind | null, options?: { reviewTagId?: string }) => {
      const nextView =
        nextPanelKind === 'diff'
          ? isCalendarDiffView(viewTypeRef.current)
            ? viewTypeRef.current
            : 'day'
          : viewTypeRef.current;
      const normalizedPanel = normalizePanelForView(nextView, nextPanelKind);
      const nextReviewTagId =
        normalizedPanel === 'review' ? (options?.reviewTagId ?? reviewTagIdRef.current) : null;

      startTransition(() => {
        setViewType(nextView);
        setPanelKindState(normalizedPanel);
        setReviewTagIdState(nextReviewTagId);
      });
      writeCalendarUrl(
        nextView,
        currentDateRef.current,
        normalizedPanel,
        nextReviewTagId,
        'replace',
      );
    },
    [writeCalendarUrl],
  );

  const setReviewTagId = useCallback(
    (nextReviewTagId: string | null) => {
      const nextView = viewTypeRef.current;
      startTransition(() => {
        setViewType(nextView);
        setPanelKindState('review');
        setReviewTagIdState(nextReviewTagId);
      });
      writeCalendarUrl(nextView, currentDateRef.current, 'review', nextReviewTagId, 'replace');
    },
    [writeCalendarUrl],
  );

  const navigateRelative = useCallback(
    (direction: 'prev' | 'next' | 'today') => {
      let newDate: Date;

      if (direction === 'today') {
        newDate = new Date();
      } else {
        const multiplier = direction === 'next' ? 1 : -1;
        newDate = new Date(currentDateRef.current);

        if (isMultiDayView(viewTypeRef.current)) {
          newDate.setDate(
            currentDateRef.current.getDate() + getMultiDayCount(viewTypeRef.current) * multiplier,
          );
        } else {
          switch (viewTypeRef.current) {
            case 'day':
              newDate.setDate(currentDateRef.current.getDate() + 1 * multiplier);
              break;
            case 'week':
              newDate.setDate(currentDateRef.current.getDate() + 7 * multiplier);
              break;
            default:
              newDate.setDate(currentDateRef.current.getDate() + 7 * multiplier);
          }
        }
      }

      navigateToDate(newDate, true);
    },
    [navigateToDate],
  );

  const contextValue = useMemo(
    () => ({
      currentDate,
      viewType,
      panelKind,
      reviewTagId,
      isPending,
      navigateToDate,
      changeView,
      navigateRelative,
      setPanelKind,
      setReviewTagId,
    }),
    [
      currentDate,
      viewType,
      panelKind,
      reviewTagId,
      isPending,
      navigateToDate,
      changeView,
      navigateRelative,
      setPanelKind,
      setReviewTagId,
    ],
  );

  return (
    <CalendarNavigationContext.Provider value={contextValue}>
      {children}
    </CalendarNavigationContext.Provider>
  );
};

/** カレンダーナビゲーションコンテキストを取得するフック（カレンダーページ外ではnullを返す） */
export function useCalendarNavigation() {
  const context = useContext(CalendarNavigationContext);
  if (!context) {
    // カレンダーページ以外ではnullを返す
    return null;
  }
  return context;
}
