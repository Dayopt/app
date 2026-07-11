'use client';

import { type QueryKey, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { toast } from '@/lib/toast';
import { api } from '@/lib/trpc';

import { createTempId } from './mutations/mutationUtils';

function isLaneListQuery(lane: 'plans' | 'logs') {
  return (query: { queryKey: unknown }): boolean => {
    const key = query.queryKey;
    return (
      Array.isArray(key) && Array.isArray(key[0]) && key[0][0] === lane && key[0][1] === 'list'
    );
  };
}

const isPlansListQuery = isLaneListQuery('plans');
const isLogsListQuery = isLaneListQuery('logs');

function isTimeModelListQuery(query: { queryKey: unknown }): boolean {
  return isPlansListQuery(query) || isLogsListQuery(query);
}

function isTimeOverlapError(error: { message: string }): boolean {
  return error.message.includes('TIME_OVERLAP');
}

interface MutationContext {
  snapshots: ReadonlyArray<readonly [QueryKey, unknown]>;
  tempId?: string;
}

/**
 * Plan / Log の書き込み mutation 群。
 *
 * optimistic-update skill に従い、create は temp 行 insert、update は該当行 patch、
 * delete は行除去を onMutate で行い、onError で snapshot rollback、onSettled で再検証する。
 */
export function useTimeModelWriteMutations() {
  const utils = api.useUtils();
  const queryClient = useQueryClient();
  const t = useTranslations('entry.timeModel');

  type PlanListItem = NonNullable<Awaited<ReturnType<typeof utils.plans.list.fetch>>>[number];
  type LogListItem = NonNullable<Awaited<ReturnType<typeof utils.logs.list.fetch>>>[number];

  const snapshot = async (): Promise<MutationContext> => {
    await Promise.all([utils.plans.list.cancel(), utils.logs.list.cancel()]);
    return {
      snapshots: queryClient.getQueriesData({ predicate: isTimeModelListQuery }) as Array<
        [QueryKey, unknown]
      >,
    };
  };

  const restore = (context: MutationContext | undefined) => {
    for (const [queryKey, data] of context?.snapshots ?? []) {
      queryClient.setQueryData(queryKey, data);
    }
  };

  const reportError = (error: { message: string }) => {
    toast.error(isTimeOverlapError(error) ? t('toast.overlap') : t('toast.saveFailed'));
  };

  // getById も対象に含めて router 全体を再検証する（Inspector の updated_at 鮮度を保つ）
  const invalidate = () => {
    void utils.plans.invalidate();
    void utils.logs.invalidate();
  };

  const createPlan = api.plans.create.useMutation({
    onMutate: async (input): Promise<MutationContext> => {
      const context = await snapshot();
      const tempId = createTempId();
      const nowIso = new Date().toISOString();
      const tempPlan: PlanListItem = {
        id: tempId,
        user_id: '',
        tag_id: input.tagId ?? null,
        external_calendar_event_id: input.externalCalendarEventId ?? null,
        title: input.title,
        note: input.note ?? null,
        start_at: input.start_at,
        end_at: input.end_at,
        skipped_at: null,
        source: 'manual',
        deleted_at: null,
        created_at: nowIso,
        updated_at: nowIso,
      };
      queryClient.setQueriesData<PlanListItem[]>({ predicate: isPlansListQuery }, (old) =>
        old ? [...old, tempPlan] : [tempPlan],
      );
      return { ...context, tempId };
    },
    onSuccess: (created, _input, context) => {
      if (!created) return;
      queryClient.setQueriesData<PlanListItem[]>({ predicate: isPlansListQuery }, (old) =>
        old
          ? old.filter((row) => row.id !== context?.tempId && row.id !== created.id).concat(created)
          : [created],
      );
    },
    onError: (error, _input, context) => {
      restore(context);
      reportError(error);
    },
    onSettled: invalidate,
  });

  const createLog = api.logs.create.useMutation({
    onMutate: async (input): Promise<MutationContext> => {
      const context = await snapshot();
      const tempId = createTempId();
      const nowIso = new Date().toISOString();
      const tempLog: LogListItem = {
        id: tempId,
        user_id: '',
        tag_id: input.tagId ?? null,
        plan_id: input.planId ?? null,
        external_calendar_event_id: input.externalCalendarEventId ?? null,
        title: input.title,
        note: input.note ?? null,
        start_at: input.start_at,
        end_at: input.end_at,
        source: 'manual',
        fulfillment_score: input.fulfillmentScore ?? null,
        deleted_at: null,
        created_at: nowIso,
        updated_at: nowIso,
      };
      queryClient.setQueriesData<LogListItem[]>({ predicate: isLogsListQuery }, (old) =>
        old ? [...old, tempLog] : [tempLog],
      );
      return { ...context, tempId };
    },
    onSuccess: (created, _input, context) => {
      if (!created) return;
      queryClient.setQueriesData<LogListItem[]>({ predicate: isLogsListQuery }, (old) =>
        old
          ? old.filter((row) => row.id !== context?.tempId && row.id !== created.id).concat(created)
          : [created],
      );
    },
    onError: (error, _input, context) => {
      restore(context);
      reportError(error);
    },
    onSettled: invalidate,
  });

  const updatePlan = api.plans.update.useMutation({
    onMutate: async (input): Promise<MutationContext> => {
      const context = await snapshot();
      queryClient.setQueriesData<PlanListItem[]>({ predicate: isPlansListQuery }, (old) =>
        old?.map((row) =>
          row.id === input.id
            ? {
                ...row,
                ...(input.data.title !== undefined ? { title: input.data.title } : {}),
                ...(input.data.note !== undefined ? { note: input.data.note ?? null } : {}),
                ...(input.data.tagId !== undefined ? { tag_id: input.data.tagId ?? null } : {}),
                ...(input.data.start_at !== undefined ? { start_at: input.data.start_at } : {}),
                ...(input.data.end_at !== undefined ? { end_at: input.data.end_at } : {}),
              }
            : row,
        ),
      );
      return context;
    },
    onError: (error, _input, context) => {
      restore(context);
      reportError(error);
    },
    onSettled: invalidate,
  });

  const updateLog = api.logs.update.useMutation({
    onMutate: async (input): Promise<MutationContext> => {
      const context = await snapshot();
      queryClient.setQueriesData<LogListItem[]>({ predicate: isLogsListQuery }, (old) =>
        old?.map((row) =>
          row.id === input.id
            ? {
                ...row,
                ...(input.data.title !== undefined ? { title: input.data.title } : {}),
                ...(input.data.note !== undefined ? { note: input.data.note ?? null } : {}),
                ...(input.data.tagId !== undefined ? { tag_id: input.data.tagId ?? null } : {}),
                ...(input.data.start_at !== undefined ? { start_at: input.data.start_at } : {}),
                ...(input.data.end_at !== undefined ? { end_at: input.data.end_at } : {}),
              }
            : row,
        ),
      );
      return context;
    },
    onError: (error, _input, context) => {
      restore(context);
      reportError(error);
    },
    onSettled: invalidate,
  });

  const reportDeleteError = () => toast.error(t('toast.deleteFailed'));
  const reportRestoreError = () => toast.error(t('toast.restoreFailed'));

  const deletePlan = api.plans.delete.useMutation({
    onMutate: async (input): Promise<MutationContext> => {
      const context = await snapshot();
      queryClient.setQueriesData<PlanListItem[]>({ predicate: isPlansListQuery }, (old) =>
        old?.filter((row) => row.id !== input.id),
      );
      return context;
    },
    onError: (_error, _input, context) => {
      restore(context);
      reportDeleteError();
    },
    onSettled: invalidate,
  });

  const deleteLog = api.logs.delete.useMutation({
    onMutate: async (input): Promise<MutationContext> => {
      const context = await snapshot();
      queryClient.setQueriesData<LogListItem[]>({ predicate: isLogsListQuery }, (old) =>
        old?.filter((row) => row.id !== input.id),
      );
      return context;
    },
    onError: (_error, _input, context) => {
      restore(context);
      reportDeleteError();
    },
    onSettled: invalidate,
  });

  const restorePlan = api.plans.restore.useMutation({
    onMutate: snapshot,
    onError: (_error, _input, context) => {
      restore(context);
      reportRestoreError();
    },
    onSettled: invalidate,
  });

  const restoreLog = api.logs.restore.useMutation({
    onMutate: snapshot,
    onError: (_error, _input, context) => {
      restore(context);
      reportRestoreError();
    },
    onSettled: invalidate,
  });

  const skipPlan = api.plans.skip.useMutation({
    onMutate: snapshot,
    onError: (_error, _input, context) => {
      restore(context);
      toast.error(t('toast.skipFailed'));
    },
    onSettled: invalidate,
  });

  const unskipPlan = api.plans.unskip.useMutation({
    onMutate: snapshot,
    onError: (_error, _input, context) => {
      restore(context);
      toast.error(t('toast.skipFailed'));
    },
    onSettled: invalidate,
  });

  return {
    createLog,
    createPlan,
    deleteLog,
    deletePlan,
    restoreLog,
    restorePlan,
    skipPlan,
    unskipPlan,
    updateLog,
    updatePlan,
  };
}
