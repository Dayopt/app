import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { api } from '@/lib/trpc';
import { isEntriesListQuery } from './mutationUtils';
import type { EntryMutationContext } from './useEntryMutationContext';

export function useEntrySkipMutations(context: EntryMutationContext) {
  const { t, queryClient, utils } = context;
  // スキップ解除（Undo用 — skipped_at をクリアして自動記録を復活させる）
  const unskipEntry = api.entries.unskip.useMutation({
    onMutate: async ({ id }) => {
      logger.debug('[mutation:unskip] onMutate', { id });

      await utils.entries.list.cancel();
      await utils.entries.getById.cancel({ id });

      type EntryListData = Awaited<ReturnType<typeof utils.entries.list.fetch>>;
      const previousEntriesList = queryClient.getQueriesData<EntryListData>({
        predicate: isEntriesListQuery,
      });
      const previousEntry = utils.entries.getById.getData({ id });

      queryClient.setQueriesData<EntryListData>({ predicate: isEntriesListQuery }, (oldData) => {
        if (!oldData) return oldData;
        return oldData.map((entry) => (entry.id === id ? { ...entry, skipped_at: null } : entry));
      });
      utils.entries.getById.setData({ id }, (oldData) => {
        if (!oldData) return undefined;
        return { ...oldData, skipped_at: null };
      });

      return { id, previousEntriesList, previousEntry };
    },
    onSuccess: (_, { id }) => {
      logger.debug('[mutation:unskip] onSuccess', { id });
      toast.success(t('entry.toast.unskipped'));
    },
    onError: (err, _variables, context) => {
      logger.error('[mutation:unskip] onError', err);

      // スキップ後に入れた記録と重なる場合、自動記録は復活できない
      if (err.message.includes('TIME_OVERLAP') || err.message.includes('重複')) {
        toast.error(t('entry.errors.timeOverlap'));
      } else {
        toast.error(t('entry.toast.updateFailed'));
      }

      if (context?.previousEntriesList) {
        for (const [queryKey, data] of context.previousEntriesList) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      if (context?.previousEntry) {
        utils.entries.getById.setData({ id: context.id }, context.previousEntry);
      }
    },
    onSettled: (_, __, variables) => {
      void utils.entries.list.invalidate();
      if (variables?.id) {
        void utils.entries.getById.invalidate({ id: variables.id });
      }
    },
  });

  // スキップ（計画したがやらなかった。実績集計から除外、計画履歴は残る）
  const skipEntry = api.entries.skip.useMutation({
    onMutate: async ({ id }) => {
      logger.debug('[mutation:skip] onMutate', { id });

      await utils.entries.list.cancel();
      await utils.entries.getById.cancel({ id });

      type EntryListData = Awaited<ReturnType<typeof utils.entries.list.fetch>>;
      const previousEntriesList = queryClient.getQueriesData<EntryListData>({
        predicate: isEntriesListQuery,
      });
      const previousEntry = utils.entries.getById.getData({ id });

      // entries_skip_shape 制約に合わせ、編集済み actual も楽観的にクリアする
      const skip = <
        T extends {
          skipped_at?: string | null;
          actual_start_time?: string | null;
          actual_end_time?: string | null;
        },
      >(
        entry: T,
      ): T => ({
        ...entry,
        skipped_at: new Date().toISOString(),
        actual_start_time: null,
        actual_end_time: null,
      });

      queryClient.setQueriesData<EntryListData>({ predicate: isEntriesListQuery }, (oldData) => {
        if (!oldData) return oldData;
        return oldData.map((entry) => (entry.id === id ? skip(entry) : entry));
      });
      utils.entries.getById.setData({ id }, (oldData) => {
        if (!oldData) return undefined;
        return skip(oldData);
      });

      return { id, previousEntriesList, previousEntry };
    },
    onSuccess: (_, { id }) => {
      logger.debug('[mutation:skip] onSuccess', { id });
      toast.success(t('entry.toast.skipped'), {
        action: {
          label: t('common.undo'),
          onClick: () => {
            unskipEntry.mutate({ id });
          },
        },
      });
    },
    onError: (err, _variables, context) => {
      logger.error('[mutation:skip] onError', err);
      toast.error(t('entry.toast.skipFailed'));

      if (context?.previousEntriesList) {
        for (const [queryKey, data] of context.previousEntriesList) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      if (context?.previousEntry) {
        utils.entries.getById.setData({ id: context.id }, context.previousEntry);
      }
    },
    onSettled: (_, __, variables) => {
      void utils.entries.list.invalidate();
      if (variables?.id) {
        void utils.entries.getById.invalidate({ id: variables.id });
      }
    },
  });
  return { skipEntry, unskipEntry };
}
