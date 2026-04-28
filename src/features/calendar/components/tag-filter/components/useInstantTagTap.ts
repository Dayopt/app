'use client';

import { useCallback } from 'react';

import { useTranslations } from 'next-intl';

import { useEntryMutations } from '@/features/entry';
import { toast } from '@/lib/toast';
import { api } from '@/lib/trpc';

import {
  computeTapEntryTimeRange,
  extractDurationMinutes,
  inferTapDurationMinutes,
} from '../../../lib/createFromTap';

interface InstantTapTag {
  id: string;
  name: string;
}

/**
 * Tag タップ即作成 hook
 *
 * Sidebar / Mobile footer の tag タップで時刻指定 UI を出さず、
 * α アルゴリズム（now + 最頻 duration）で即 entry 作成する。
 *
 * - duration: entries.list キャッシュ内の同タグ過去 entry の最頻値、
 *   履歴ゼロなら 30 分にフォールバック
 * - 作成成功で 5 秒の undo トースト（onClick で deleteEntry）
 * - 作成失敗（overlap 等）は useEntryMutations 側のエラーハンドリングに委譲
 *
 * @see docs/design/timeline-precision-redesign/overview.md OD-1 (α) / Project B
 */
export function useInstantTagTap() {
  const t = useTranslations();
  const utils = api.useUtils();
  const { createEntry, deleteEntry } = useEntryMutations({ suppressCreateToast: true });

  return useCallback(
    (tag: InstantTapTag) => {
      // entries.list キャッシュから同タグの過去 duration を集計
      const cached = utils.entries.list.getData() ?? [];
      const sameTagEntries = cached.filter((e) => e.tag_id === tag.id);
      const durations = extractDurationMinutes(sameTagEntries);
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
    [createEntry, deleteEntry, t, utils],
  );
}
