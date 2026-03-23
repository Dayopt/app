/**
 * useRecentPlace — 履歴ブロックのクリック配置フック
 *
 * クリックで現在時刻（次の15分境界）にエントリを配置する。
 */

import { useCallback } from 'react';

import { useEntryMutations } from '@/features/entry';
import { api } from '@/platform/trpc';

const SNAP_MINUTES = 15;

function snapToNextInterval(date: Date): Date {
  const snapped = new Date(date);
  const minutes = snapped.getMinutes();
  const remainder = minutes % SNAP_MINUTES;
  if (remainder > 0) {
    snapped.setMinutes(minutes + (SNAP_MINUTES - remainder));
  }
  snapped.setSeconds(0, 0);
  return snapped;
}

/** クリックで現在時刻にエントリを配置するハンドラを返す */
export function useRecentPlace() {
  const { createEntry } = useEntryMutations();
  const setTags = api.entries.setTags.useMutation();

  const handlePlace = useCallback(
    (tagId: string, durationMinutes: number, tagName: string) => {
      const now = new Date();
      const start = snapToNextInterval(now);
      const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

      createEntry.mutate(
        {
          title: tagName,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          duration_minutes: durationMinutes,
        },
        {
          onSuccess: (newEntry) => {
            setTags.mutate({ entryId: newEntry.id, tagId });
          },
        },
      );
    },
    [createEntry, setTags],
  );

  return { handlePlace };
}
