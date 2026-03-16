import { useMemo } from 'react';

import { isCalendarViewPath } from '../lib/route-utils';
import type { CalendarViewType } from '../types/calendar.types';

// 有効なビュータイプかチェック
function isValidViewType(view: string): view is CalendarViewType {
  if (['day', 'week'].includes(view)) return true;
  const match = view.match(/^(\d+)day$/);
  if (match) {
    const n = parseInt(match[1]!);
    return n >= 2 && n <= 9;
  }
  return false;
}

interface CalendarProviderProps {
  initialDate: Date;
  initialView: CalendarViewType;
}

interface UseCalendarProviderPropsReturn {
  isCalendarPage: boolean;
  calendarProviderProps: CalendarProviderProps | null;
}

/**
 * カレンダーページ判定とProvider設定を提供するフック
 *
 * パフォーマンス最適化:
 * - useMemoで結果をメモ化
 * - pathname/searchParamsが変わらなければ再計算しない
 *
 * @param pathname - 現在のパス
 * @param searchParams - URLSearchParams
 * @returns カレンダーページ判定とProvider設定
 */
export function useCalendarProviderProps(
  pathname: string,
  searchParams: URLSearchParams,
): UseCalendarProviderPropsReturn {
  // searchParamsからdate値を取得（useMemoの依存配列用）
  const dateParam = searchParams.get('date');

  return useMemo(() => {
    // ロケールプレフィックスを除去してビューパスを判定
    const pathWithoutLocale = pathname.replace(/^\/(ja|en)/, '');
    const isCalendarPage = isCalendarViewPath(pathWithoutLocale);

    if (!isCalendarPage) {
      return { isCalendarPage, calendarProviderProps: null };
    }

    const pathSegments = pathname.split('/');
    const lastSegment = pathSegments[pathSegments.length - 1] ?? '';
    // ビュータイプが有効でない場合は 'day' をデフォルトにする
    const view: CalendarViewType = isValidViewType(lastSegment) ? lastSegment : 'day';

    let initialDate: Date | undefined;
    if (dateParam) {
      const parsedDate = new Date(dateParam);
      if (!isNaN(parsedDate.getTime())) {
        initialDate = parsedDate;
      }
    }

    return {
      isCalendarPage,
      calendarProviderProps: {
        initialDate: initialDate || new Date(),
        initialView: view,
      },
    };
  }, [pathname, dateParam]);
}
