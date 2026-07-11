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

function isTimeModelQuery(query: { queryKey: unknown }): boolean {
  const key = query.queryKey;
  return (
    Array.isArray(key) && Array.isArray(key[0]) && (key[0][0] === 'plans' || key[0][0] === 'logs')
  );
}

interface TimeModelListFilter {
  search?: string;
  tagId?: string;
  planId?: string;
  startDate?: string;
  endDate?: string;
  includeSkipped?: boolean;
  sortBy?: 'created_at' | 'updated_at' | 'title' | 'start_at';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

interface TimeModelListRow {
  id: string;
  title: string;
  note: string | null;
  tag_id: string | null;
  start_at: string;
  end_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  skipped_at?: string | null;
  plan_id?: string | null;
}

function getListFilter(queryKey: unknown): TimeModelListFilter {
  if (!Array.isArray(queryKey)) return {};
  const meta = queryKey[1];
  if (!meta || typeof meta !== 'object') return {};
  const input = (meta as { input?: unknown }).input;
  return input && typeof input === 'object' ? (input as TimeModelListFilter) : {};
}

/** query input と行が一致するか。create の offset>0 cache は順位不明のため更新しない。 */
export function doesTimeModelListQueryIncludeRow(
  queryKey: unknown,
  row: TimeModelListRow,
  lane: 'plans' | 'logs',
  operation: 'create' | 'update' = 'create',
): boolean {
  const filter = getListFilter(queryKey);
  if (row.deleted_at != null) return false;
  if (operation === 'create' && (filter.offset ?? 0) > 0) return false;
  if (filter.tagId && row.tag_id !== filter.tagId) return false;
  if (lane === 'logs' && filter.planId && row.plan_id !== filter.planId) return false;
  if (lane === 'plans' && filter.includeSkipped === false && row.skipped_at != null) return false;

  if (filter.search) {
    const search = filter.search.toLocaleLowerCase();
    const haystack = `${row.title}\n${row.note ?? ''}`.toLocaleLowerCase();
    if (!haystack.includes(search)) return false;
  }

  if (filter.startDate && filter.endDate) {
    if (!(
      Date.parse(row.start_at) < Date.parse(filter.endDate) &&
      Date.parse(row.end_at) > Date.parse(filter.startDate)
    ))
      return false;
  } else if (filter.startDate && Date.parse(row.start_at) < Date.parse(filter.startDate)) {
    return false;
  } else if (filter.endDate && Date.parse(row.start_at) > Date.parse(filter.endDate)) {
    return false;
  }

  return true;
}

function sortAndLimitRows<T extends TimeModelListRow>(
  rows: T[],
  queryKey: unknown,
  lane: 'plans' | 'logs',
): T[] {
  const filter = getListFilter(queryKey);
  const sortBy = filter.sortBy ?? 'start_at';
  const sortOrder = filter.sortOrder ?? (lane === 'plans' ? 'asc' : 'desc');
  const sorted = [...rows].sort((a, b) => {
    const comparison = String(a[sortBy]).localeCompare(String(b[sortBy]));
    return sortOrder === 'asc' ? comparison : -comparison;
  });
  return filter.limit ? sorted.slice(0, filter.limit) : sorted;
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
      snapshots: queryClient.getQueriesData({ predicate: isTimeModelQuery }) as Array<
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

  const insertIntoMatchingLists = <T extends TimeModelListRow>(
    lane: 'plans' | 'logs',
    row: T,
    replaceId?: string,
  ) => {
    const predicate = lane === 'plans' ? isPlansListQuery : isLogsListQuery;
    for (const [queryKey, data] of queryClient.getQueriesData<T[]>({ predicate })) {
      if (!doesTimeModelListQueryIncludeRow(queryKey, row, lane, 'create')) continue;
      const old = data ?? [];
      const next = old.filter((candidate) => candidate.id !== replaceId && candidate.id !== row.id);
      queryClient.setQueryData(queryKey, sortAndLimitRows([...next, row], queryKey, lane));
    }
  };

  const patchMatchingLists = <T extends TimeModelListRow>(
    lane: 'plans' | 'logs',
    id: string,
    patch: (row: T) => T,
  ) => {
    const predicate = lane === 'plans' ? isPlansListQuery : isLogsListQuery;
    for (const [queryKey, data] of queryClient.getQueriesData<T[]>({ predicate })) {
      if (!data?.some((row) => row.id === id)) continue;
      const patched = data.map((row) => (row.id === id ? patch(row) : row));
      const filtered = patched.filter(
        (row) => row.id !== id || doesTimeModelListQueryIncludeRow(queryKey, row, lane, 'update'),
      );
      queryClient.setQueryData(queryKey, sortAndLimitRows(filtered, queryKey, lane));
    }
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
      insertIntoMatchingLists('plans', tempPlan);
      return { ...context, tempId };
    },
    onSuccess: (created, _input, context) => {
      if (!created) return;
      insertIntoMatchingLists('plans', created, context?.tempId);
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
      insertIntoMatchingLists('logs', tempLog);
      return { ...context, tempId };
    },
    onSuccess: (created, _input, context) => {
      if (!created) return;
      insertIntoMatchingLists('logs', created, context?.tempId);
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
      const patch = (row: PlanListItem): PlanListItem => ({
        ...row,
        ...(input.data.title !== undefined ? { title: input.data.title } : {}),
        ...(input.data.note !== undefined ? { note: input.data.note ?? null } : {}),
        ...(input.data.tagId !== undefined ? { tag_id: input.data.tagId ?? null } : {}),
        ...(input.data.start_at !== undefined ? { start_at: input.data.start_at } : {}),
        ...(input.data.end_at !== undefined ? { end_at: input.data.end_at } : {}),
      });
      patchMatchingLists('plans', input.id, patch);
      utils.plans.getById.setData({ id: input.id }, (old) => (old ? patch(old) : old));
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
      const patch = (row: LogListItem): LogListItem => ({
        ...row,
        ...(input.data.title !== undefined ? { title: input.data.title } : {}),
        ...(input.data.note !== undefined ? { note: input.data.note ?? null } : {}),
        ...(input.data.tagId !== undefined ? { tag_id: input.data.tagId ?? null } : {}),
        ...(input.data.start_at !== undefined ? { start_at: input.data.start_at } : {}),
        ...(input.data.end_at !== undefined ? { end_at: input.data.end_at } : {}),
      });
      patchMatchingLists('logs', input.id, patch);
      utils.logs.getById.setData({ id: input.id }, (old) => (old ? patch(old) : old));
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
