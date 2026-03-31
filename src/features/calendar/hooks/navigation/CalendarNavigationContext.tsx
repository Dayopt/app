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

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { useCalendarNavigationStore } from '@/stores/useCalendarNavigationStore';

import { formatCalendarDateParam, parseCalendarDateParam } from '../../lib/date-param';
import { isCalendarViewPath } from '../../lib/route-utils';
import type { CalendarViewType } from '../../types/calendar.types';
import { getMultiDayCount, isMultiDayView } from '../../types/calendar.types';

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

  return { isCalendarPage: true as const, initialDate, initialView: view };
}

interface CalendarNavigationContextValue {
  currentDate: Date;
  viewType: CalendarViewType;
  /** ナビゲーション中（日付変更・ビュー切替）のトランジション状態 */
  isPending: boolean;
  navigateToDate: (date: Date, updateUrl?: boolean) => void;
  changeView: (view: CalendarViewType) => void;
  navigateRelative: (direction: 'prev' | 'next' | 'today') => void;
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
  const { isCalendarPage, initialDate, initialView } = useMemo(
    () => resolveCalendarProps(pathname),
    [pathname],
  );

  const [currentDate, setCurrentDate] = useState(initialDate);
  const [viewType, setViewType] = useState<CalendarViewType>(initialView);

  // モバイル判定（day view固定に使用）
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const isMobileRef = useRef(isMobile);

  // カレンダー再描画が重いため、日付・ビュー変更をtransitionとしてマーク
  // UIスレッドをブロックせず、ユーザー入力（スクロール等）を優先する
  const [isPending, startTransition] = useTransition();

  // useRefで最新値を保持し、コールバックの依存配列を安定化
  const currentDateRef = useRef(currentDate);
  const viewTypeRef = useRef(viewType);
  const initialDateRef = useRef(initialDate);

  // 現在のlocaleを取得（例: /ja/day -> ja）
  const locale = pathname?.split('/')[1] || 'ja';
  const localeRef = useRef(locale);

  // ref同期 + グローバルストア同期（1つのeffectに統合）
  React.useEffect(() => {
    currentDateRef.current = currentDate;
    viewTypeRef.current = viewType;
    localeRef.current = locale;
    isMobileRef.current = isMobile;
    // Palette等がカレンダー表示日/ビュータイプを参照するためグローバルに同期
    useCalendarNavigationStore.getState()._syncViewedDate(currentDate);
    useCalendarNavigationStore.getState()._syncViewType(viewType);
  }, [currentDate, viewType, locale, isMobile]);

  // モバイルでday以外のビューが設定された場合、強制的にdayに切替
  // （URL直アクセスやブラウザ戻る/進むでweek URLに遷移した場合のガード）
  React.useEffect(() => {
    if (isCalendarPage && isMobile && viewType !== 'day') {
      startTransition(() => {
        setViewType('day');
      });
      // URLもday viewに更新
      const dateString = formatCalendarDateParam(currentDateRef.current);
      const params = new URLSearchParams(window.location.search);
      params.set('date', dateString);
      window.history.replaceState(
        null,
        '',
        `/${localeRef.current}/calendar/day?${params.toString()}`,
      );
    }
  }, [isCalendarPage, isMobile, viewType]);

  // URL由来の initialView が変更されたら viewType を同期
  // （ブラウザ戻る/進む、直接URL入力時）
  React.useEffect(() => {
    if (isCalendarPage && initialView !== viewType) {
      setViewType(initialView);
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

  const navigateToDate = useCallback((date: Date, updateUrl = false) => {
    startTransition(() => {
      setCurrentDate(date);
    });

    if (updateUrl) {
      const dateString = formatCalendarDateParam(date);
      // 既存のquery paramを保持しつつdateのみ更新
      const params = new URLSearchParams(window.location.search);
      params.set('date', dateString);
      const newUrl = `/${localeRef.current}/calendar/${viewTypeRef.current}?${params.toString()}`;
      // 日付変更は履歴に追加しない（replaceState）
      window.history.replaceState(null, '', newUrl);
    }
  }, []);

  const changeView = useCallback((view: CalendarViewType) => {
    // モバイルではday viewのみ許可
    if (isMobileRef.current && view !== 'day') return;

    startTransition(() => {
      setViewType(view);
    });
    const dateString = formatCalendarDateParam(currentDateRef.current);
    // 既存のquery paramを保持しつつdateのみ更新
    const params = new URLSearchParams(window.location.search);
    params.set('date', dateString);
    // pushState: 即座にURL更新、サーバーナビゲーションなし
    // Next.js App Router は pushState と統合済み（usePathname等が同期する）
    window.history.pushState(
      null,
      '',
      `/${localeRef.current}/calendar/${view}?${params.toString()}`,
    );
  }, []);

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
      isPending,
      navigateToDate,
      changeView,
      navigateRelative,
    }),
    [currentDate, viewType, isPending, navigateToDate, changeView, navigateRelative],
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
