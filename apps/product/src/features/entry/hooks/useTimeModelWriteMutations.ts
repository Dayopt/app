'use client';

import { type QueryKey, useQueryClient } from '@tanstack/react-query';
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

/** Plan / Log 作成・編集のキャッシュ rollback と再検証を共通化する。 */
export function useTimeModelWriteMutations() {
  const utils = api.useUtils();
  const queryClient = useQueryClient();
  const t = useTranslations('entry.timeModel');

  const snapshot = async () => {
    await Promise.all([utils.plans.list.cancel(), utils.logs.list.cancel()]);
    return {
      snapshots: queryClient.getQueriesData({ predicate: isTimeModelListQuery }) as Array<
        [QueryKey, unknown]
      >,
    };
  };

  const restore = (
    context: { snapshots: ReadonlyArray<readonly [QueryKey, unknown]> } | undefined,
  ) => {
    for (const [queryKey, data] of context?.snapshots ?? []) {
      queryClient.setQueryData(queryKey, data);
    }
  };

  const reportError = (error: { message: string }) => {
    toast.error(isTimeOverlapError(error) ? t('toast.overlap') : t('toast.saveFailed'));
  };

  const invalidate = () => {
    void utils.plans.list.invalidate();
    void utils.logs.list.invalidate();
  };

  const createPlan = api.plans.create.useMutation({
    onMutate: snapshot,
    onError: (error, _input, context) => {
      restore(context);
      reportError(error);
    },
    onSettled: invalidate,
  });

  const updatePlan = api.plans.update.useMutation({
    onMutate: snapshot,
    onError: (error, _input, context) => {
      restore(context);
      reportError(error);
    },
    onSettled: invalidate,
  });

  const createLog = api.logs.create.useMutation({
    onMutate: snapshot,
    onError: (error, _input, context) => {
      restore(context);
      reportError(error);
    },
    onSettled: invalidate,
  });

  const updateLog = api.logs.update.useMutation({
    onMutate: snapshot,
    onError: (error, _input, context) => {
      restore(context);
      reportError(error);
    },
    onSettled: invalidate,
  });

  return { createLog, createPlan, updateLog, updatePlan };
}
