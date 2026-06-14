import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { api } from '@/lib/trpc';
import { isEntriesListQuery } from './mutationUtils';
import type { EntryMutationContext } from './useEntryMutationContext';

export function useEntryDeleteMutations(context: EntryMutationContext) {
  const { t, queryClient, utils, closeInspector } = context;
  // 復元（Undo用 — soft-deleteされたエントリのdeleted_atをクリア）
  const restoreEntry = api.entries.restore.useMutation({
    onSuccess: (_, { id }) => {
      logger.debug('[mutation:restore] onSuccess', { id });
      toast.success(t('entry.toast.restored'));
      void utils.entries.list.invalidate(undefined, { refetchType: 'all' });
      void utils.entries.getById.invalidate({ id }, { refetchType: 'all' });
    },
    onError: (error) => {
      logger.error('[mutation:restore] onError', error);
      toast.error(t('entry.toast.restoreFailed'));
    },
  });

  // 削除（soft-delete）
  const deleteEntry = api.entries.delete.useMutation({
    onMutate: async ({ id }) => {
      logger.debug('[mutation:delete] onMutate', { id });

      await utils.entries.list.cancel();
      await utils.entries.getById.cancel({ id });

      // スナップショット（全キャッシュ対象 — 日付フィルター付きビューも含む）
      type EntryListData = Awaited<ReturnType<typeof utils.entries.list.fetch>>;
      const previousEntriesList = queryClient.getQueriesData<EntryListData>({
        predicate: isEntriesListQuery,
      });
      const previousEntries = utils.entries.list.getData();
      const previousEntry =
        utils.entries.getById.getData({ id }) ?? previousEntries?.find((e) => e.id === id);

      // 楽観的更新: リストから即座に削除（全キャッシュ対象）
      queryClient.setQueriesData<EntryListData>({ predicate: isEntriesListQuery }, (oldData) => {
        if (!oldData) return oldData;
        return oldData.filter((entry) => entry.id !== id);
      });

      // undo付きtoast（soft-deleteなのでrestore APIで同一ID・タグを完全復元）
      const displayTitle = previousEntry?.title || t('entry.untitled');
      toast.success(t('entry.toast.deleted', { title: displayTitle }), {
        duration: 6000,
        action: {
          label: t('common.undo'),
          onClick: () => {
            restoreEntry.mutate({ id });
          },
        },
      });

      closeInspector();

      return { id, previousEntriesList, previousEntry };
    },
    onSuccess: (_, { id }) => {
      logger.debug('[mutation:delete] onSuccess', { id });
      void utils.entries.list.invalidate(undefined, { refetchType: 'all' });
      void utils.entries.getById.invalidate({ id }, { refetchType: 'all' });
    },
    onError: (error, { id }, context) => {
      logger.error('[mutation:delete] onError', error);
      toast.error(t('entry.toast.deleteFailed', { error: error.message }));

      // エラー時: 全ての entries.list キャッシュをロールバック
      if (context?.previousEntriesList) {
        for (const [queryKey, data] of context.previousEntriesList) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      if (context?.previousEntry) {
        utils.entries.getById.setData({ id }, context.previousEntry);
      }
    },
  });
  return { restoreEntry, deleteEntry };
}
