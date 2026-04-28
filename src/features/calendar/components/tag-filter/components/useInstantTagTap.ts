'use client';

import { useCallback } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { useEntryMutations } from '@/features/entry';
import { toast } from '@/lib/toast';

import {
  computeTapEntryTimeRange,
  extractDurationMinutes,
  inferTapDurationMinutes,
} from '../../../lib/createFromTap';

interface InstantTapTag {
  id: string;
  name: string;
}

/** entries.list の cached query を判定する predicate（tRPC v11 key 形式） */
function isEntriesListQuery(query: { queryKey: unknown }): boolean {
  const key = query.queryKey;
  return (
    Array.isArray(key) &&
    key.length >= 1 &&
    Array.isArray(key[0]) &&
    key[0][0] === 'entries' &&
    key[0][1] === 'list'
  );
}

interface CachedEntry {
  start_time: string | null;
  end_time: string | null;
  duration_minutes?: number | null;
  tag_id?: string | null;
  tagId?: string | null;
}

/**
 * Tag タップ即作成 hook
 *
 * Sidebar / Mobile footer の tag タップで時刻指定 UI を出さず、
 * α アルゴリズム（now + 最頻 duration）で即 entry 作成する。
 *
 * - duration: 全 `entries.list` キャッシュ（date-filtered 等を含む）から
 *   同タグの**過去** entry の duration を集計し最頻値を採用、履歴ゼロなら 30 分
 * - tag マッチングは `tag_id` / `tagId`（camelCase）両方を許容（楽観的更新タイミング差を吸収）
 * - 未来予定の entry は除外（実利用パターンを反映しないため）
 * - 作成成功で 5 秒の undo トースト（onClick で deleteEntry）
 * - 作成失敗（overlap 等）は useEntryMutations 側のエラーハンドリングに委譲
 *
 * @see docs/design/timeline-precision-redesign/overview.md OD-1 (α) / Project B
 */
export function useInstantTagTap() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { createEntry, deleteEntry } = useEntryMutations({ suppressCreateToast: true });

  return useCallback(
    (tag: InstantTapTag) => {
      // 全 entries.list キャッシュをまたいで同タグ過去 entry を集める
      // （calendar は date-filtered key を使うため、undefined key だけ見ると履歴を取りこぼす）
      const allCached = queryClient.getQueriesData<CachedEntry[]>({
        predicate: isEntriesListQuery,
      });

      const seen = new Set<string>();
      const collected: CachedEntry[] = [];
      const nowMs = Date.now();

      for (const [, data] of allCached) {
        if (!data) continue;
        for (const entry of data) {
          // tag_id / tagId 両方を許容（楽観的更新で camelCase が先に立つケースを吸収）
          if (entry.tag_id !== tag.id && entry.tagId !== tag.id) continue;
          // 未来予定 entry は履歴として除外
          if (entry.start_time && new Date(entry.start_time).getTime() > nowMs) continue;
          // 同一 entry が複数 cache に存在するため start+end で de-dup（id を持たないキャッシュもあるため）
          const dedupKey = `${entry.start_time ?? ''}|${entry.end_time ?? ''}|${entry.duration_minutes ?? ''}`;
          if (seen.has(dedupKey)) continue;
          seen.add(dedupKey);
          collected.push(entry);
        }
      }

      const durations = extractDurationMinutes(collected);
      const durationMinutes = inferTapDurationMinutes(durations);

      const { startISO, endISO } = computeTapEntryTimeRange(new Date(), durationMinutes);

      createEntry.mutate(
        {
          title: tag.name,
          tagId: tag.id,
          start_time: startISO,
          end_time: endISO,
        },
        {
          onSuccess: (newEntry) => {
            toast.success(t('entry.toast.created', { title: tag.name }), {
              duration: 5000,
              action: {
                label: t('common.undo'),
                onClick: () => deleteEntry.mutate({ id: newEntry.id }),
              },
            });
          },
        },
      );
    },
    [createEntry, deleteEntry, queryClient, t],
  );
}
