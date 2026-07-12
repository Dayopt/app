'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { toast } from '@/lib/toast';
import { api } from '@/lib/trpc';

function isTimeModelListQuery(query: { queryKey: unknown }): boolean {
  const key = query.queryKey;
  return (
    Array.isArray(key) &&
    Array.isArray(key[0]) &&
    (key[0][0] === 'plans' || key[0][0] === 'records') &&
    key[0][1] === 'list'
  );
}

function isTimeOverlapError(error: { message: string }): boolean {
  return error.message.includes('TIME_OVERLAP');
}

/** Plan → Record の記録導線に共通の rollback / 再検証を提供する。 */
export function useTimeblockRecordMutations() {
  const utils = api.useUtils();
  const queryClient = useQueryClient();
  const t = useTranslations('timeblock.editor');

  const recordPlan = api.plans.record.useMutation({
    onMutate: async () => {
      await Promise.all([utils.plans.list.cancel(), utils.records.list.cancel()]);
      return { snapshots: queryClient.getQueriesData({ predicate: isTimeModelListQuery }) };
    },
    onSuccess: (record) => {
      utils.records.list.setData(undefined, (old) => (old ? [...old, record] : [record]));
      toast.success(t('toast.recorded'));
    },
    onError: (error, _input, context) => {
      for (const [queryKey, data] of context?.snapshots ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
      toast.error(isTimeOverlapError(error) ? t('toast.overlap') : t('toast.recordFailed'));
    },
    onSettled: () => {
      void utils.plans.list.invalidate();
      void utils.records.list.invalidate();
    },
  });

  const confirmDay = api.plans.confirmDay.useMutation({
    onMutate: async () => {
      await Promise.all([utils.plans.list.cancel(), utils.records.list.cancel()]);
      return { snapshots: queryClient.getQueriesData({ predicate: isTimeModelListQuery }) };
    },
    onSuccess: (records) => {
      utils.records.list.setData(undefined, (old) => (old ? [...old, ...records] : records));
      toast.success(t('toast.dayConfirmed'));
    },
    onError: (error, _input, context) => {
      for (const [queryKey, data] of context?.snapshots ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
      toast.error(isTimeOverlapError(error) ? t('toast.overlap') : t('toast.confirmFailed'));
    },
    onSettled: () => {
      void utils.plans.list.invalidate();
      void utils.records.list.invalidate();
    },
  });

  return { confirmDay, recordPlan };
}
