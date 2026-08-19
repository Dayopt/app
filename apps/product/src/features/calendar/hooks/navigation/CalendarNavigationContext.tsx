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

import { getNextPeriod, getPreviousPeriod } from '../../domain/view-range';
import { formatCalendarDateParam, parseCalendarDateParam } from '../../lib/date-param';
import { resolveWorkspaceTab } from '../../lib/route-utils';
import type { CalendarViewType } from '../../types/calendar.types';

// ── カレンダーページ判定・初期値計算（旧 useCalendarProviderProps） ──

function isValidViewType(view: string): view is CalendarViewType {
  if (['day', 'week'].includes(view)) return true;
  const match = view.match(/^(\d+)day$/);
  if (match) {
    const n = parseInt(match[1]!);
    return n >= 2 && n <= 7;
  }
  return false;
}

/** モバイルで提供する表示。Weekはレーン切替で密度を確保し、2〜7日は対象外とする。 */
function isMobileCalendarViewSupported(view: CalendarViewType): boolean {
  return view === 'day' || view === 'week';
}

/** SSR安全に現在の URL search から日付を読む（window.location.search は client-only） */
function readDateParamFromLocation(): Date | undefined {
  if (typeof window === 'undefined') return undefined;
  return parseCalendarDateParam(new URLSearchParams(window.location.search).get('date'));
}

/**
 * pathname と URL searchParams からワークスペースタブ判定と初期値を計算
 *
 * `fallbackDate` は calendar / report いずれでもない workspaceTab（例: /settings）で
 * 使う initialDate のフォールバック。呼び出し側の currentDateRef を渡すことで、
 * `/report` `/settings` 滞在中に initialDate が `new Date()` へ空転し続けるのを防ぐ
 * （docs/projects/workspace-shell-restructure/overview.md §6-10 B）。
 */
function resolveCalendarProps(pathname: string, fallbackDate?: Date) {
  const pathWithoutLocale = pathname.replace(/^\/(ja|en)/, '');
  const workspaceTab = resolveWorkspaceTab(pathWithoutLocale);

  if (workspaceTab === 'report') {
    const initialDate = readDateParamFromLocation() ?? fallbackDate ?? new Date();
    return {
      isCalendarPage: false as const,
      workspaceTab,
      initialDate,
      initialView: 'week' as CalendarViewType,
    };
  }

  if (workspaceTab === 'other') {
    return {
      isCalendarPage: false as const,
      workspaceTab,
      initialDate: fallbackDate ?? new Date(),
      initialView: 'week' as CalendarViewType,
    };
  }

  const viewParam =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('view') : null;
  const view: CalendarViewType = viewParam && isValidViewType(viewParam) ? viewParam : 'week';
  const initialDate = readDateParamFromLocation() ?? new Date();

  return {
    isCalendarPage: true as const,
    workspaceTab,
    initialDate,
    initialView: view,
  };
}

interface CalendarNavigationContextValue {
  currentDate: Date;
  viewType: CalendarViewType;
  /** ナビゲーション中（日付変更・ビュー切替）のトランジション状態 */
  isPending: boolean;
  navigateToDate: (date: Date, updateUrl?: boolean) => void;
  changeView: (view: CalendarViewType) => void;
  navigateRelative: (direction: 'prev' | 'next' | 'today', showWeekends?: boolean) => void;
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

  // pathname + window.location.search からワークスペースタブ判定と初期値を計算。
  // render 中は ref を読めない（react-hooks/refs）ため fallbackDate は渡さない —
  // 'other'（/settings 等）の initialDate が pathname 変化のたびに new Date() へ
  // 空転する点は overview.md §6-10 B も「害は無い」と明記しており、event handler
  // 側（popstate。下記）でだけ currentDateRef を使う。
  const { isCalendarPage, initialDate, initialView } = useMemo(
    () => resolveCalendarProps(pathname),
    [pathname],
  );

  // useRefで最新値を保持し、コールバックの依存配列を安定化
  const currentDateRef = useRef<Date>(initialDate);

  const [currentDate, setCurrentDate] = useState(initialDate);
  const [viewType, setViewType] = useState<CalendarViewType>(initialView);

  // モバイル判定（Day / Week以外の表示を制限するために使用）
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const isMobileRef = useRef(isMobile);

  // カレンダー再描画が重いため、日付・ビュー変更をtransitionとしてマーク
  // UIスレッドをブロックせず、ユーザー入力（スクロール等）を優先する
  const [isPending, startTransition] = useTransition();

  // useRefで最新値を保持し、コールバックの依存配列を安定化
  const viewTypeRef = useRef(viewType);
  const initialDateRef = useRef(initialDate);
  const pathnameRef = useRef(pathname);

  // 現在のlocaleを取得（例: /ja/day -> ja）
  const locale = pathname?.split('/')[1] || 'ja';
  const localeRef = useRef(locale);

  // ref同期 + グローバルストア同期（1つのeffectに統合）
  React.useEffect(() => {
    currentDateRef.current = currentDate;
    viewTypeRef.current = viewType;
    localeRef.current = locale;
    isMobileRef.current = isMobile;
    pathnameRef.current = pathname;
    // Palette等がカレンダー表示日/ビュータイプを参照するためグローバルに同期
    useCalendarNavigationStore.getState()._syncViewedDate(currentDate);
    useCalendarNavigationStore.getState()._syncViewType(viewType);
  }, [currentDate, viewType, locale, isMobile, pathname]);

  /**
   * 今いる面（calendar / report）の URL を書く。
   *
   * 旧 `writeCalendarUrl` から改名: view はカレンダー限定の概念になったため、
   * 「今いる面」ベースで書き先を分岐させる（overview.md §5-4-b）。
   * タブ判定は `pathnameRef`（usePathname() 由来）のみで行い、
   * `useSearchParams()` は使わない（§5-3 と同じ理由）。
   */
  const writeWorkspaceUrl = useCallback(
    (view: CalendarViewType, date: Date, historyMode: 'push' | 'replace') => {
      const pathWithoutLocale = pathnameRef.current.replace(/^\/(ja|en)/, '');
      const currentTab = resolveWorkspaceTab(pathWithoutLocale);

      const params = new URLSearchParams(window.location.search);
      params.set('date', formatCalendarDateParam(date));

      let newUrl: string;
      if (currentTab === 'report') {
        // range 等の既存クエリはそのまま素通しし、date だけ更新する
        newUrl = `/${localeRef.current}/report?${params.toString()}`;
      } else {
        params.set('view', view);
        newUrl = `/${localeRef.current}/calendar?${params.toString()}`;
      }

      if (historyMode === 'push') {
        window.history.pushState(null, '', newUrl);
      } else {
        window.history.replaceState(null, '', newUrl);
      }
    },
    [],
  );

  // モバイルで未対応の複数日ビューが設定された場合、dayへ切替
  // （URL直アクセスやブラウザ戻る/進むで2〜7day URLに遷移した場合のガード）
  React.useEffect(() => {
    if (isCalendarPage && isMobile && !isMobileCalendarViewSupported(viewType)) {
      startTransition(() => {
        setViewType('day');
      });
      // URLもday viewに更新
      writeWorkspaceUrl('day', currentDateRef.current, 'replace');
    }
  }, [isCalendarPage, isMobile, viewType, writeWorkspaceUrl]);

  // URL由来の initialView が変更されたら viewType を同期
  // （ブラウザ戻る/進む、直接URL入力時）
  // モバイルでは Day / Week 以外への変更を拒否（Effect A の replaceState と競合防止）
  React.useEffect(() => {
    if (isCalendarPage && initialView !== viewType) {
      if (isMobileRef.current && !isMobileCalendarViewSupported(initialView)) return;
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

  React.useEffect(() => {
    const handlePopState = () => {
      const resolved = resolveCalendarProps(window.location.pathname, currentDateRef.current);
      // 'other'（/settings 等）は非対応のまま。calendar / report は両方扱う
      // （overview.md §6-10 B「popstate の早期return」対策）。
      if (resolved.workspaceTab === 'other') return;

      if (resolved.workspaceTab === 'report') {
        startTransition(() => {
          setCurrentDate(resolved.initialDate);
        });
        return;
      }

      const nextView =
        isMobileRef.current && !isMobileCalendarViewSupported(resolved.initialView)
          ? 'day'
          : resolved.initialView;

      startTransition(() => {
        setCurrentDate(resolved.initialDate);
        setViewType(nextView);
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
        writeWorkspaceUrl(viewTypeRef.current, date, 'replace');
      }
    },
    [writeWorkspaceUrl],
  );

  const changeView = useCallback(
    (view: CalendarViewType) => {
      // モバイルではDay / Weekのみ許可
      if (isMobileRef.current && !isMobileCalendarViewSupported(view)) return;

      startTransition(() => {
        setViewType(view);
      });
      // pushState: 即座にURL更新、サーバーナビゲーションなし
      // Next.js App Router は pushState と統合済み（usePathname等が同期する）
      writeWorkspaceUrl(view, currentDateRef.current, 'push');
    },
    [writeWorkspaceUrl],
  );

  const navigateRelative = useCallback(
    (direction: 'prev' | 'next' | 'today', showWeekends = true) => {
      let newDate: Date;

      if (direction === 'today') {
        newDate = new Date();
      } else {
        newDate =
          direction === 'next'
            ? getNextPeriod(viewTypeRef.current, currentDateRef.current, showWeekends)
            : getPreviousPeriod(viewTypeRef.current, currentDateRef.current, showWeekends);
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
