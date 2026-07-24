'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { toast } from '@/lib/toast';
import { api } from '@/lib/trpc';

import {
  insertTimeModelRowIntoMatchingLists,
  isTimeblockNotFoundError,
  removeMissingTimeblockFromCache,
} from './useTimeblockWriteMutations';

function isTimeOverlapError(error: { data?: unknown; message: string }): boolean {
  const serviceCode =
    error.data && typeof error.data === 'object' && 'serviceCode' in error.data
      ? error.data.serviceCode
      : undefined;
  return serviceCode === 'TIME_OVERLAP' || error.message.includes('TIME_OVERLAP');
}

/** Plan → Record の記録導線に共通のcache反映と再検証を提供する。 */
export function useTimeblockRecordMutations() {
  const utils = api.useUtils();
  const queryClient = useQueryClient();
  const t = useTranslations('timeblock.editor');

  const recordPlan = api.plans.record.useMutation({
    onMutate: async () => {
      await Promise.all([utils.plans.list.cancel(), utils.records.list.cancel()]);
    },
    onSuccess: (record) => {
      insertTimeModelRowIntoMatchingLists(queryClient, 'records', record);
      utils.records.getById.setData({ id: record.id }, record);
      toast.success(t('toast.recorded'));
    },
    onError: (error, input) => {
      if (isTimeblockNotFoundError(error)) {
        removeMissingTimeblockFromCache(queryClient, 'plans', input.id);
      }
      toast.error(isTimeOverlapError(error) ? t('toast.overlap') : t('toast.recordFailed'));
    },
    onSettled: () => {
      void utils.plans.invalidate();
      void utils.records.invalidate();
      void utils.statistics.invalidate();
    },
  });

  const confirmDay = api.plans.confirmDay.useMutation({
    onMutate: async () => {
      await Promise.all([utils.plans.list.cancel(), utils.records.list.cancel()]);
    },
    onSuccess: (records) => {
      for (const record of records) {
        insertTimeModelRowIntoMatchingLists(queryClient, 'records', record);
        utils.records.getById.setData({ id: record.id }, record);
      }
      toast.success(t('toast.dayConfirmed'));
    },
    onError: (error) => {
      toast.error(isTimeOverlapError(error) ? t('toast.overlap') : t('toast.confirmFailed'));
    },
    onSettled: () => {
      void utils.plans.invalidate();
      void utils.records.invalidate();
      void utils.statistics.invalidate();
    },
  });

  return { confirmDay, recordPlan };
}
