import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { api } from '@/lib/trpc';
import { useRef } from 'react';
import type { UpdateEntryInput } from '../../schemas/entry';
import { isEntriesListQuery } from './mutationUtils';
import type { EntryMutationContext } from './useEntryMutationContext';

export function useUpdateEntryMutation(
  context: EntryMutationContext,
  suppressUpdateErrorToast?: () => boolean,
) {
  const { t, queryClient, utils } = context;
  const updateMutationSeqRef = useRef(0);
  const latestUpdateSeqByIdRef = useRef(new Map<string, number>());
  const isLatestUpdateMutation = (id: string, mutationSeq?: number) => {
    if (mutationSeq == null) return true;
    return latestUpdateSeqByIdRef.current.get(id) === mutationSeq;
  };
  // 更新
  const updateEntry = api.entries.update.useMutation({
    onMutate: async ({ id, data }) => {
      logger.debug('[mutation:update] onMutate', { id, fields: Object.keys(data) });
      const mutationSeq = updateMutationSeqRef.current + 1;
      updateMutationSeqRef.current = mutationSeq;
      latestUpdateSeqByIdRef.current.set(id, mutationSeq);

      // 1. 進行中のクエリをキャンセル（競合回避）
      await utils.entries.list.cancel();
      await utils.entries.getById.cancel({ id });
      await utils.entries.getById.cancel({ id, include: { tags: true } });

      // 2. 現在のデータをスナップショット（ロールバック用）
      type EntryListData = Awaited<ReturnType<typeof utils.entries.list.fetch>>;
      const previousEntriesList = queryClient.getQueriesData<EntryListData>({
        predicate: isEntriesListQuery,
      });
      const previousEntry = utils.entries.getById.getData({ id });

      // 3. 楽観的更新: TanStack Queryキャッシュを更新
      const updateData: UpdateEntryInput = {};

      if (data.start_time !== undefined) updateData.start_time = data.start_time;
      if (data.end_time !== undefined) updateData.end_time = data.end_time;
      if (data.actual_start_time !== undefined)
        updateData.actual_start_time = data.actual_start_time;
      if (data.actual_end_time !== undefined) updateData.actual_end_time = data.actual_end_time;
      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.origin !== undefined) updateData.origin = data.origin;

      // 4. TanStack Queryキャッシュを楽観的に更新
      // キャッシュ間移動対応: エントリが存在するキャッシュからフルデータを取得
      let fullEntryForCrossCache: EntryListData[0] | undefined;
      if (data.start_time !== undefined) {
        for (const [, cacheData] of previousEntriesList) {
          if (cacheData) {
            fullEntryForCrossCache = cacheData.find((e) => e.id === id);
            if (fullEntryForCrossCache) break;
          }
        }
      }

      queryClient.setQueriesData<EntryListData>({ predicate: isEntriesListQuery }, (oldData) => {
        if (!oldData) return oldData;
        const exists = oldData.some((entry) => entry.id === id);
        if (exists) {
          return oldData.map((entry) =>
            entry.id === id ? (Object.assign({}, entry, updateData) as typeof entry) : entry,
          );
        }
        // エントリがこのキャッシュに無い場合、start_time設定時は追加（キャッシュ間移動）
        if (fullEntryForCrossCache && data.start_time !== undefined) {
          return [
            ...oldData,
            Object.assign({}, fullEntryForCrossCache, updateData) as typeof fullEntryForCrossCache,
          ];
        }
        return oldData;
      });

      // 個別エントリキャッシュを更新（tagsなし/あり両方）
      utils.entries.getById.setData({ id }, (oldData) => {
        if (!oldData) return undefined;
        return Object.assign({}, oldData, updateData);
      });
      utils.entries.getById.setData({ id, include: { tags: true } }, (oldData) => {
        if (!oldData) return undefined;
        return Object.assign({}, oldData, updateData);
      });

      return { id, previousEntriesList, previousEntry, mutationSeq };
    },
    onSuccess: (result, variables, context) => {
      logger.debug('[mutation:update] onSuccess', { id: variables.id });
      if (!isLatestUpdateMutation(variables.id, context?.mutationSeq)) {
        logger.debug('[mutation:update] stale onSuccess ignored', { id: variables.id });
        return;
      }
      // サーバーから返ってきた最新データでキャッシュを更新
      // adjustedEntries はキャッシュ操作用（リストに含めない）
      const { adjustedEntries, ...updatedEntry } = result;
      type EntryListData = Awaited<ReturnType<typeof utils.entries.list.fetch>>;
      queryClient.setQueriesData<EntryListData>({ predicate: isEntriesListQuery }, (oldData) => {
        if (!oldData) return oldData;

        let updated = oldData;

        // 自エントリのキャッシュを更新
        const exists = updated.some((entry) => entry.id === variables.id);
        if (exists) {
          updated = updated.map((entry) => {
            if (entry.id === variables.id) {
              return { ...updatedEntry, tagId: entry.tagId ?? null };
            }
            return entry;
          });
        } else if (updatedEntry.start_time) {
          updated = [...updated, { ...updatedEntry, tagId: null }];
        }

        // auto-shrink で調整された隣接エントリのキャッシュも更新
        if (adjustedEntries.length > 0) {
          updated = updated.map((entry) => {
            const adjusted = adjustedEntries.find((a) => a.id === entry.id);
            if (adjusted) {
              return { ...entry, ...adjusted };
            }
            return entry;
          });
        }

        return updated;
      });

      // entries.getById キャッシュも最新データで更新（楽観的ロック用 updated_at を含む）
      utils.entries.getById.setData({ id: variables.id }, (oldData) => {
        if (!oldData) return undefined;
        return { ...oldData, ...updatedEntry };
      });
      utils.entries.getById.setData({ id: variables.id, include: { tags: true } }, (oldData) => {
        if (!oldData) return undefined;
        return { ...oldData, ...updatedEntry };
      });

      // 自動保存（title、description、日時など）はtoast非表示
    },
    onError: (err, _variables, context) => {
      logger.error('[mutation:update] onError', err);
      if (context?.id && !isLatestUpdateMutation(context.id, context.mutationSeq)) {
        logger.debug('[mutation:update] stale onError ignored', { id: context.id });
        // snapshot rollback は latest mutation の onSuccess を上書きしうるため使えない。
        // 代わりに invalidate して server truth で cache を refetch する。
        // (latest が success ならサーバーの新しい状態に揃う / latest も fail なら latest の
        //  rollback 後の cache が stale optimistic を含むのでこれで真値に戻す)
        void utils.entries.list.invalidate();
        void utils.entries.getById.invalidate({ id: context.id });
        return;
      }

      if (!suppressUpdateErrorToast?.()) {
        // 競合検出（楽観的ロック）: 他タブ/デバイスで変更されたエントリ
        if (err.data?.code === 'CONFLICT') {
          toast.error(t('entry.toast.conflict'), {
            action: {
              label: t('common.reload'),
              onClick: () => {
                if (context?.id) {
                  void utils.entries.list.invalidate();
                  void utils.entries.getById.invalidate({ id: context.id });
                }
              },
            },
          });
        } else if (
          err.message.includes('既にエントリがあります') ||
          err.message.includes('TIME_OVERLAP')
        ) {
          toast.error(t('entry.errors.timeOverlap'));
        } else {
          toast.error(t('entry.toast.updateFailed'));
        }
      }

      // エラー時: 全ての entries.list キャッシュをロールバック
      if (context?.previousEntriesList) {
        for (const [queryKey, data] of context.previousEntriesList) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      if (context?.previousEntry) {
        utils.entries.getById.setData({ id: context.id }, context.previousEntry);
      }
    },
    onSettled: async (_result, _error, variables, context) => {
      if (variables?.id && !isLatestUpdateMutation(variables.id, context?.mutationSeq)) {
        logger.debug('[mutation:update] stale onSettled ignored', { id: variables.id });
        return;
      }
      void utils.entries.list.invalidate();
    },
  });
  return updateEntry;
}
