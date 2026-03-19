/**
 * 日付範囲フィルター
 *
 * Plan/Record共通で使用する日付範囲フィルタリング。
 */

/** 日付範囲フィルターの選択肢（'all'〜'this_month'） */
export type DateRangeFilter =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month';

/**
 * 日付文字列が指定された日付範囲フィルターに一致するか判定
 *
 * @param dateStr - ISO 8601形式の日時文字列
 * @param filter - 日付範囲フィルター
 * @returns 一致する場合 true
 */
export function matchesDateRangeFilter(
  dateStr: string | null | undefined,
  filter: DateRangeFilter,
): boolean {
  if (filter === 'all') return true;
  if (!dateStr) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const itemDate = new Date(dateStr);
  itemDate.setHours(0, 0, 0, 0);

  switch (filter) {
    case 'today':
      return itemDate.getTime() === today.getTime();

    case 'yesterday': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return itemDate.getTime() === yesterday.getTime();
    }

    case 'this_week': {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(startOfWeek.getDate() - today.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 6);
      return itemDate >= startOfWeek && itemDate <= endOfWeek;
    }

    case 'last_week': {
      const startOfLastWeek = new Date(today);
      startOfLastWeek.setDate(startOfLastWeek.getDate() - today.getDay() - 7);
      const endOfLastWeek = new Date(startOfLastWeek);
      endOfLastWeek.setDate(endOfLastWeek.getDate() + 6);
      return itemDate >= startOfLastWeek && itemDate <= endOfLastWeek;
    }

    case 'this_month': {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return itemDate >= startOfMonth && itemDate <= endOfMonth;
    }

    default:
      return true;
  }
}
