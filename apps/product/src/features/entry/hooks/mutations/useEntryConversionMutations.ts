import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { api } from '@/lib/trpc';
import { isEntriesListQuery } from './mutationUtils';
import type { EntryMutationContext } from './useEntryMutationContext';

export function useEntryConversionMutations(context: EntryMutationContext) {
  const { t, queryClient, utils } = context;
  // planned → unplanned 明示変換
  const convertPlannedToUnplanned = api.entries.convertPlannedToUnplanned.useMutation({
    onMutate: async ({ id }) => {
      logger.debug('[mutation:convertPlannedToUnplanned] onMutate', { id });

      await utils.entries.list.cancel();
      await utils.entries.getById.cancel({ id });
      await utils.entries.getById.cancel({ id, include: { tags: true } });

      type EntryListData = Awaited<ReturnType<typeof utils.entries.list.fetch>>;
      const previousEntriesList = queryClient.getQueriesData<EntryListData>({
        predicate: isEntriesListQuery,
      });
      const previousEntry = utils.entries.getById.getData({ id });

      const convert = <
        T extends {
          origin?: string | null;
          start_time?: string | null;
          end_time?: string | null;
          planned_duration_minutes?: number | null;
        },
      >(
        entry: T,
      ): T => ({
        ...entry,
        origin: 'unplanned',
        start_time: null,
        end_time: null,
        planned_duration_minutes: null,
      });

      queryClient.setQueriesData<EntryListData>({ predicate: isEntriesListQuery }, (oldData) => {
        if (!oldData) return oldData;
        return oldData.map((entry) => (entry.id === id ? convert(entry) : entry));
      });

      utils.entries.getById.setData({ id }, (oldData) => {
        if (!oldData) return undefined;
        return convert(oldData);
      });
      utils.entries.getById.setData({ id, include: { tags: true } }, (oldData) => {
        if (!oldData) return undefined;
        return convert(oldData);
      });

      return { id, previousEntriesList, previousEntry };
    },
    onSuccess: (updatedEntry, variables) => {
      logger.debug('[mutation:convertPlannedToUnplanned] onSuccess', { id: variables.id });
      type EntryListData = Awaited<ReturnType<typeof utils.entries.list.fetch>>;

      queryClient.setQueriesData<EntryListData>({ predicate: isEntriesListQuery }, (oldData) => {
        if (!oldData) return oldData;
        return oldData.map((entry) =>
          entry.id === variables.id ? { ...updatedEntry, tagId: entry.tagId ?? null } : entry,
        );
      });

      utils.entries.getById.setData({ id: variables.id }, (oldData) => {
        if (!oldData) return undefined;
        return { ...oldData, ...updatedEntry };
      });
      utils.entries.getById.setData({ id: variables.id, include: { tags: true } }, (oldData) => {
        if (!oldData) return undefined;
        return { ...oldData, ...updatedEntry };
      });

      toast.success(t('entry.toast.updated'));
    },
    onError: (err, _variables, context) => {
      logger.error('[mutation:convertPlannedToUnplanned] onError', err);

      if (err.message.includes('既にエントリがあります') || err.message.includes('TIME_OVERLAP')) {
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

  // unplanned → planned 明示変換
  const convertUnplannedToPlanned = api.entries.convertUnplannedToPlanned.useMutation({
    onMutate: async ({ id }) => {
      logger.debug('[mutation:convertUnplannedToPlanned] onMutate', { id });

      await utils.entries.list.cancel();
      await utils.entries.getById.cancel({ id });
      await utils.entries.getById.cancel({ id, include: { tags: true } });

      type EntryListData = Awaited<ReturnType<typeof utils.entries.list.fetch>>;
      const previousEntriesList = queryClient.getQueriesData<EntryListData>({
        predicate: isEntriesListQuery,
      });
      const previousEntry = utils.entries.getById.getData({ id });

      const convert = <
        T extends {
          origin?: string | null;
          start_time?: string | null;
          end_time?: string | null;
          actual_start_time?: string | null;
          actual_end_time?: string | null;
        },
      >(
        entry: T,
      ): T => ({
        ...entry,
        origin: 'planned',
        start_time: entry.actual_start_time ?? null,
        end_time: entry.actual_end_time ?? null,
      });

      queryClient.setQueriesData<EntryListData>({ predicate: isEntriesListQuery }, (oldData) => {
        if (!oldData) return oldData;
        return oldData.map((entry) => (entry.id === id ? convert(entry) : entry));
      });

      utils.entries.getById.setData({ id }, (oldData) => {
        if (!oldData) return undefined;
        return convert(oldData);
      });
      utils.entries.getById.setData({ id, include: { tags: true } }, (oldData) => {
        if (!oldData) return undefined;
        return convert(oldData);
      });

      return { id, previousEntriesList, previousEntry };
    },
    onSuccess: (updatedEntry, variables) => {
      logger.debug('[mutation:convertUnplannedToPlanned] onSuccess', { id: variables.id });
      type EntryListData = Awaited<ReturnType<typeof utils.entries.list.fetch>>;

      queryClient.setQueriesData<EntryListData>({ predicate: isEntriesListQuery }, (oldData) => {
        if (!oldData) return oldData;
        return oldData.map((entry) =>
          entry.id === variables.id ? { ...updatedEntry, tagId: entry.tagId ?? null } : entry,
        );
      });

      utils.entries.getById.setData({ id: variables.id }, (oldData) => {
        if (!oldData) return undefined;
        return { ...oldData, ...updatedEntry };
      });
      utils.entries.getById.setData({ id: variables.id, include: { tags: true } }, (oldData) => {
        if (!oldData) return undefined;
        return { ...oldData, ...updatedEntry };
      });

      toast.success(t('entry.toast.updated'));
    },
    onError: (err, _variables, context) => {
      logger.error('[mutation:convertUnplannedToPlanned] onError', err);

      if (err.message.includes('既にエントリがあります') || err.message.includes('TIME_OVERLAP')) {
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
  return { convertPlannedToUnplanned, convertUnplannedToPlanned };
}
