/**
 * Entry Realtime購読フック
 *
 * @description
 * エントリ（entries テーブル）のDB変更をリアルタイムで検知し、
 * TanStack Queryのキャッシュを自動更新する。
 *
 * 対象テーブル: entries
 *
 * 検知イベント:
 * - INSERT: 新規エントリ作成
 * - UPDATE: エントリ更新（タイトル、時間、タグ等）
 * - DELETE: エントリ削除
 *
 * @see https://supabase.com/docs/guides/realtime/postgres-changes
 */

'use client';

import { useEntryCacheStore } from '@/features/entry';
import { createRealtimeHook } from '@/platform/supabase/realtime/createRealtimeHook';

/**
 * エントリの日付が、キャッシュされた日付範囲に含まれるかを判定
 *
 * tRPC v11 queryKey: [['entries', 'list'], { input: { startDate, endDate }, type }]
 */
function doesEntryOverlapQueryRange(entryDate: Date, queryKey: ReadonlyArray<unknown>): boolean {
  // queryKey[1] = { input: { startDate?, endDate? }, type }
  const meta = queryKey[1] as { input?: { startDate?: string; endDate?: string } } | undefined;
  const input = meta?.input;

  // 日付範囲がないクエリは安全側で無効化
  if (!input?.startDate || !input?.endDate) return true;

  return entryDate >= new Date(input.startDate) && entryDate <= new Date(input.endDate);
}

export const useEntryRealtime = createRealtimeHook({
  name: 'entry',
  table: 'entries',
  useMutationGuard: () => useEntryCacheStore((state) => state.isMutating),
  onInvalidate: (utils, payload) => {
    const recordId = payload.new?.id ?? payload.old?.id;

    // 変更エントリの日付を収集（UPDATE時は新旧両方の日付範囲を無効化）
    const entryDates: Date[] = [];
    for (const record of [payload.new, payload.old]) {
      const startTime = (record as Record<string, unknown> | null)?.start_time;
      if (typeof startTime === 'string') {
        const date = new Date(startTime);
        if (!isNaN(date.getTime())) entryDates.push(date);
      }
    }

    if (entryDates.length > 0) {
      // 変更エントリの日付を含むキャッシュのみ選択的に無効化
      void utils.entries.list.invalidate(undefined, {
        predicate: (query) =>
          entryDates.some((date) => doesEntryOverlapQueryRange(date, query.queryKey)),
      });
    } else {
      // 日付不明時はフォールバック（全無効化）
      void utils.entries.list.invalidate(undefined, { refetchType: 'all' });
    }

    // 個別エントリのキャッシュも無効化（Inspector等で使用）
    if (recordId) {
      void utils.entries.getById.invalidate({ id: recordId });
    }
  },
});
