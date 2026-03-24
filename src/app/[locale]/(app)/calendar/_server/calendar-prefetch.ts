import type { CalendarViewType } from '@/features/calendar';
import { calculateViewDateRange } from '@/features/calendar';
import { logger } from '@/lib/logger';
import { createServerHelpers, dehydrate } from '@/platform/trpc/server';

/**
 * カレンダービュー用 prefetch（day/week/Nday）
 *
 * ビュータイプに応じた日付範囲でプランデータを事前取得し、
 * クライアントでのデータ取得を高速化する。
 *
 * 認証エラー（ログアウト直後等）ではprefetchをスキップし、
 * 空のdehydratedStateを返す。クライアント側で再取得される。
 */
export async function prefetchCalendarData(view: CalendarViewType, targetDate: Date) {
  const helpers = await createServerHelpers();

  // weekStartsOnはZustandストアなのでSSRではデフォルト値1（月曜日）を使用
  const viewDateRange = calculateViewDateRange(view, targetDate, 1);
  const dateFilter = {
    startDate: viewDateRange.start.toISOString(),
    endDate: viewDateRange.end.toISOString(),
  };

  try {
    await Promise.all([
      helpers.entries.list.prefetch(dateFilter),
      helpers.entries.getTagStats.prefetch(),
      helpers.tags.list.prefetch(),
    ]);
  } catch (error) {
    // 認証エラー（UNAUTHORIZED）等の場合はprefetchをスキップ
    // クライアント側のtRPCがリトライ or 認証リダイレクトを処理する
    logger.warn('prefetchCalendarData failed (possibly unauthenticated):', error);
  }

  return { helpers, dehydratedState: dehydrate(helpers.queryClient) };
}
