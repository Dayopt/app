'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import { usePathname } from 'next/navigation';

import { format } from 'date-fns';

import { useCalendarNavigationStore } from '@/stores/useCalendarNavigationStore';

import type { CalendarViewType } from '../../types/calendar.types';
import { getMultiDayCount, isMultiDayView } from '../../types/calendar.types';

interface CalendarNavigationContextValue {
  currentDate: Date;
  viewType: CalendarViewType;
  navigateToDate: (date: Date, updateUrl?: boolean) => void;
  changeView: (view: CalendarViewType) => void;
  navigateRelative: (direction: 'prev' | 'next' | 'today') => void;
}

const CalendarNavigationContext = createContext<CalendarNavigationContextValue | null>(null);

/** カレンダーナビゲーション状態を提供するコンテキストプロバイダー */
export const CalendarNavigationProvider = ({
  children,
  initialDate = new Date(),
  initialView = 'week' as CalendarViewType,
}: {
  children: React.ReactNode;
  initialDate?: Date;
  initialView?: CalendarViewType;
}) => {
  const pathname = usePathname();
  const [currentDate, setCurrentDate] = useState(initialDate);
  const [viewType, setViewType] = useState<CalendarViewType>(initialView);

  // useRefで最新値を保持し、コールバックの依存配列を安定化
  const currentDateRef = useRef(currentDate);
  const viewTypeRef = useRef(viewType);

  // 現在のlocaleを取得（例: /ja/day -> ja）
  const locale = pathname?.split('/')[1] || 'ja';
  const localeRef = useRef(locale);

  // concurrent mode安全: render中のref代入ではなくuseEffectで同期
  React.useEffect(() => {
    currentDateRef.current = currentDate;
    // グローバルストアに同期（Palette等がカレンダー表示日を参照するため）
    useCalendarNavigationStore.getState().setViewedDate(currentDate);
  }, [currentDate]);
  React.useEffect(() => {
    viewTypeRef.current = viewType;
  }, [viewType]);
  React.useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  // URL由来の initialView が変更されたら viewType を同期
  // （ブラウザ戻る/進む、直接URL入力時）
  React.useEffect(() => {
    if (initialView !== viewType) {
      setViewType(initialView);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialView変更時のみ同期
  }, [initialView]);

  const navigateToDate = useCallback((date: Date, updateUrl = false) => {
    setCurrentDate(date);

    if (updateUrl) {
      const dateString = format(date, 'yyyy-MM-dd');
      // 既存のquery paramを保持しつつdateのみ更新
      const params = new URLSearchParams(window.location.search);
      params.set('date', dateString);
      const newUrl = `/${localeRef.current}/calendar/${viewTypeRef.current}?${params.toString()}`;
      // 日付変更は履歴に追加しない（replaceState）
      window.history.replaceState(null, '', newUrl);
    }
  }, []);

  const changeView = useCallback((view: CalendarViewType) => {
    setViewType(view);
    const dateString = format(currentDateRef.current, 'yyyy-MM-dd');
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
      navigateToDate,
      changeView,
      navigateRelative,
    }),
    [currentDate, viewType, navigateToDate, changeView, navigateRelative],
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
