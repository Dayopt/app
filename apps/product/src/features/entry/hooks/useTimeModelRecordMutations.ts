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
    (key[0][0] === 'plans' || key[0][0] === 'logs') &&
    key[0][1] === 'list'
  );
}

function isTimeOverlapError(error: { message: string }): boolean {
  return error.message.includes('TIME_OVERLAP');
}

/** Plan → Log の記録導線に共通の rollback / 再検証を提供する。 */
export function useTimeModelRecordMutations() {
  const utils = api.useUtils();
  const queryClient = useQueryClient();
  const t = useTranslations('entry.timeModel');

  const recordPlan = api.plans.record.useMutation({
    onMutate: async () => {
      await Promise.all([utils.plans.list.cancel(), utils.logs.list.cancel()]);
      return { snapshots: queryClient.getQueriesData({ predicate: isTimeModelListQuery }) };
    },
    onSuccess: (log) => {
      utils.logs.list.setData(undefined, (old) => (old ? [...old, log] : [log]));
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
      void utils.logs.list.invalidate();
    },
  });

  const confirmDay = api.plans.confirmDay.useMutation({
    onMutate: async () => {
      await Promise.all([utils.plans.list.cancel(), utils.logs.list.cancel()]);
      return { snapshots: queryClient.getQueriesData({ predicate: isTimeModelListQuery }) };
    },
    onSuccess: (logs) => {
      utils.logs.list.setData(undefined, (old) => (old ? [...old, ...logs] : logs));
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
      void utils.logs.list.invalidate();
    },
  });

  return { confirmDay, recordPlan };
}
