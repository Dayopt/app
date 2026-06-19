'use client';

import { useCallback } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/trpc';

import { determineEntryOrigin, findSkippableAutoRecords } from '../domain';
import { isEntriesListQuery } from './mutations/mutationUtils';

/**
 * 新規記録の実績 range に対して「スキップで一手解決できる自動記録」の ID を返す callback を提供する。
 *
 * cache（entries.list）から候補を集めて pure な {@link findSkippableAutoRecords} に委譲する。
 * 作成 mutation の TIME_OVERLAP ハンドラと、カレンダーのドラッグ作成ドロップの双方で共用する。
 */
export function useFindSkippableAutoRecords() {
  const queryClient = useQueryClient();
  const utils = api.useUtils();

  return useCallback(
    (rangeStartMs: number, rangeEndMs: number): string[] => {
      type EntryListData = Awaited<ReturnType<typeof utils.entries.list.fetch>>;
      const lists = queryClient.getQueriesData<EntryListData>({ predicate: isEntriesListQuery });
      const byId = new Map<string, EntryListData[number]>();
      for (const [, data] of lists) {
        for (const entry of data ?? []) byId.set(entry.id, entry);
      }

      return findSkippableAutoRecords({
        rangeStartMs,
        rangeEndMs,
        isUnplannedRecord: determineEntryOrigin(new Date(rangeEndMs)) === 'unplanned',
        candidates: [...byId.values()],
      });
    },
    [queryClient, utils],
  );
}
