'use client';

/**
 * useBlockPlace — ブロック配置フック
 *
 * 「エントリ作成 + タグ設定」のフローを統一。
 * palette / history / DnDProvider の共通ロジックを集約。
 */

import { useCallback } from 'react';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { snapToNextInterval } from '@/lib/time-utils';

import { useEntryMutations } from './useEntryMutations';
import { useEntryTags } from './useEntryTags';

/** 指定時刻にブロック（エントリ + タグ）を配置するフック */
export function useBlockPlace() {
  const { createEntry } = useEntryMutations();
  const { setEntryTags } = useEntryTags();
  const t = useTranslations();

  /** 指定時刻にブロックを配置 */
  const placeBlock = useCallback(
    (params: { tagId: string; tagName: string; startTime: Date; durationMinutes: number }) => {
      const end = new Date(params.startTime.getTime() + params.durationMinutes * 60 * 1000);
      createEntry.mutate(
        {
          title: params.tagName,
          start_time: params.startTime.toISOString(),
          end_time: end.toISOString(),
          duration_minutes: params.durationMinutes,
        },
        {
          onSuccess: (newEntry) => {
            void setEntryTags(newEntry.id, params.tagId).then((ok) => {
              if (!ok) toast.error(t('sidebar.palette.tagAssignFailed'));
            });
          },
        },
      );
    },
    [createEntry, setEntryTags, t],
  );

  /** 現在時刻（次の15分境界）にブロックを配置 */
  const placeBlockNow = useCallback(
    (tagId: string, durationMinutes: number, tagName: string) => {
      placeBlock({
        tagId,
        tagName,
        startTime: snapToNextInterval(new Date()),
        durationMinutes,
      });
    },
    [placeBlock],
  );

  return { placeBlock, placeBlockNow };
}
