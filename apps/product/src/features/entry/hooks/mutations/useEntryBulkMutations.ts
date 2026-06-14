import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { api } from '@/lib/trpc';
import { isEntriesListQuery } from './mutationUtils';
import type { EntryMutationContext } from './useEntryMutationContext';

export function useEntryBulkMutations(context: EntryMutationContext) {
  const { t, queryClient, utils, closeInspector } = context;
  // 一括更新
  const bulkUpdateEntries = api.entries.bulkUpdate.useMutation({
    onMutate: async ({ ids, data }) => {
      logger.debug('[mutation:bulkUpdate] onMutate', { count: ids.length });
      await utils.entries.list.cancel();

      // スナップショット（全キャッシュ対象）
      type EntryListData = Awaited<ReturnType<typeof utils.entries.list.fetch>>;
      const previousEntriesList = queryClient.getQueriesData<EntryListData>({
        predicate: isEntriesListQuery,
      });

      queryClient.setQueriesData<EntryListData>({ predicate: isEntriesListQuery }, (oldData) => {
        if (!oldData) return oldData;
        return oldData.map((entry) => {
          if (!ids.includes(entry.id)) return entry;
          return {
            ...entry,
            ...(data.title !== undefined && { title: data.title }),
            ...(data.description !== undefined && { description: data.description }),
            ...(data.start_time !== undefined && { start_time: data.start_time }),
            ...(data.end_time !== undefined && { end_time: data.end_time }),
            ...(data.actual_start_time !== undefined && {
              actual_start_time: data.actual_start_time,
            }),
            ...(data.actual_end_time !== undefined && { actual_end_time: data.actual_end_time }),
            updated_at: new Date().toISOString(),
          } as typeof entry;
        });
      });

      return { previousEntriesList };
    },
    onSuccess: (result) => {
      toast.success(t('entry.toast.bulkUpdated', { count: result.count }));
      void utils.entries.list.invalidate(undefined, { refetchType: 'active' });
    },
    onError: (error, _variables, context) => {
      toast.error(t('entry.toast.bulkUpdateFailed', { error: error.message }));
      if (context?.previousEntriesList) {
        for (const [queryKey, data] of context.previousEntriesList) {
          queryClient.setQueryData(queryKey, data);
        }
      }
    },
  });

  // 一括削除
  const bulkDeleteEntries = api.entries.bulkDelete.useMutation({
    onMutate: async ({ ids }) => {
      logger.debug('[mutation:bulkDelete] onMutate', { count: ids.length });
      await utils.entries.list.cancel();

      // スナップショット（全キャッシュ対象）
      type EntryListData = Awaited<ReturnType<typeof utils.entries.list.fetch>>;
      const previousEntriesList = queryClient.getQueriesData<EntryListData>({
        predicate: isEntriesListQuery,
      });

      queryClient.setQueriesData<EntryListData>({ predicate: isEntriesListQuery }, (oldData) => {
        if (!oldData) return oldData;
        return oldData.filter((entry) => !ids.includes(entry.id));
      });

      return { previousEntriesList };
    },
    onSuccess: (result) => {
      toast.success(t('entry.toast.bulkDeleted', { count: result.count }));
      closeInspector();
      void utils.entries.list.invalidate(undefined, { refetchType: 'all' });
    },
    onError: (error, _variables, context) => {
      toast.error(t('entry.toast.bulkDeleteFailed', { error: error.message }));
      if (context?.previousEntriesList) {
        for (const [queryKey, data] of context.previousEntriesList) {
          queryClient.setQueryData(queryKey, data);
        }
      }
    },
  });

  // 一括タグ追加（楽観的更新付き）
  const bulkAddTags = api.entries.bulkAddTags.useMutation({
    onMutate: async ({ entryIds, tagId }) => {
      await utils.entries.list.cancel();
      const previousEntries = utils.entries.list.getData();

      utils.entries.list.setData(undefined, (oldData) => {
        if (!oldData) return oldData;
        return oldData.map((entry) => {
          if (entryIds.includes(entry.id)) {
            return { ...entry, tagId };
          }
          return entry;
        });
      });

      return { previousEntries };
    },
    onSuccess: () => {
      toast.success(t('entry.toast.tagsAdded'));
      void utils.entries.list.invalidate(undefined, { refetchType: 'all' });
      void utils.entries.getTagStats.invalidate();
    },
    onError: (error, _variables, context) => {
      if (context?.previousEntries) {
        utils.entries.list.setData(undefined, context.previousEntries);
      }
      toast.error(t('entry.toast.tagsAddFailed', { error: error.message }));
    },
  });
  return { bulkUpdateEntries, bulkDeleteEntries, bulkAddTags };
}
