'use client';

import { type QueryKey, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { toast } from '@/lib/toast';
import { api } from '@/lib/trpc';

/** 一時ID生成（楽観的作成用） */
function createTempId(): string {
  return `temp-${Date.now()}`;
}

function isLaneListQuery(lane: 'plans' | 'records') {
  return (query: { queryKey: unknown }): boolean => {
    const key = query.queryKey;
    return (
      Array.isArray(key) && Array.isArray(key[0]) && key[0][0] === lane && key[0][1] === 'list'
    );
  };
}

const isPlansListQuery = isLaneListQuery('plans');
const isRecordsListQuery = isLaneListQuery('records');

function isTimeblockQuery(query: { queryKey: unknown }): boolean {
  const key = query.queryKey;
  return (
    Array.isArray(key) &&
    Array.isArray(key[0]) &&
    (key[0][0] === 'plans' || key[0][0] === 'records')
  );
}

interface TimeModelListFilter {
  ids?: string[];
  search?: string;
  tagId?: string;
  planId?: string;
  planIds?: string[];
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
  lane: 'plans' | 'records',
  operation: 'create' | 'update' = 'create',
): boolean {
  const filter = getListFilter(queryKey);
  if (row.deleted_at != null) return false;
  if (operation === 'create' && (filter.offset ?? 0) > 0) return false;
  if (lane === 'plans' && filter.ids && !filter.ids.includes(row.id)) return false;
  if (filter.tagId && row.tag_id !== filter.tagId) return false;
  if (lane === 'records' && filter.planId && row.plan_id !== filter.planId) return false;
  if (
    lane === 'records' &&
    filter.planIds &&
    (row.plan_id == null || !filter.planIds.includes(row.plan_id))
  )
    return false;
  if (lane === 'plans' && filter.includeSkipped === false && row.skipped_at != null) return false;

  // tag名はlist rowだけでは解決できないため、検索cacheの一致判定はserver再検証へ任せる。
  if (filter.search) return false;

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
  lane: 'plans' | 'records',
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

interface UseTimeblockWriteMutationsOptions {
  /** create の時間重複をフォーム内で表示する場合に指定する。指定時は重複トーストを出さない。 */
  onCreateTimeOverlap?: (() => void) | undefined;
}

/**
 * Plan / Record の書き込み mutation 群。
 *
 * optimistic-update skill に従い、create は temp 行 insert、update は該当行 patch、
 * delete は行除去を onMutate で行い、onError で snapshot rollback、onSettled で再検証する。
 */
export function useTimeblockWriteMutations(options: UseTimeblockWriteMutationsOptions = {}) {
  const utils = api.useUtils();
  const queryClient = useQueryClient();
  const t = useTranslations('timeblock.editor');
  const { onCreateTimeOverlap } = options;

  type PlanListItem = NonNullable<Awaited<ReturnType<typeof utils.plans.list.fetch>>>[number];
  type RecordListItem = NonNullable<Awaited<ReturnType<typeof utils.records.list.fetch>>>[number];

  const snapshot = async (): Promise<MutationContext> => {
    await Promise.all([utils.plans.list.cancel(), utils.records.list.cancel()]);
    return {
      snapshots: queryClient.getQueriesData({ predicate: isTimeblockQuery }) as Array<
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

  const reportCreateError = (error: { message: string }) => {
    if (isTimeOverlapError(error) && onCreateTimeOverlap) {
      onCreateTimeOverlap();
      return;
    }
    reportError(error);
  };

  const insertIntoMatchingLists = <T extends TimeModelListRow>(
    lane: 'plans' | 'records',
    row: T,
    replaceId?: string,
  ) => {
    const predicate = lane === 'plans' ? isPlansListQuery : isRecordsListQuery;
    for (const [queryKey, data] of queryClient.getQueriesData<T[]>({ predicate })) {
      if (getListFilter(queryKey).search) continue;
      if (!doesTimeModelListQueryIncludeRow(queryKey, row, lane, 'create')) continue;
      const old = data ?? [];
      const next = old.filter((candidate) => candidate.id !== replaceId && candidate.id !== row.id);
      queryClient.setQueryData(queryKey, sortAndLimitRows([...next, row], queryKey, lane));
    }
  };

  const patchMatchingLists = <T extends TimeModelListRow>(
    lane: 'plans' | 'records',
    id: string,
    patch: (row: T) => T,
  ) => {
    const predicate = lane === 'plans' ? isPlansListQuery : isRecordsListQuery;
    for (const [queryKey, data] of queryClient.getQueriesData<T[]>({ predicate })) {
      if (getListFilter(queryKey).search) continue;
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
    void utils.records.invalidate();
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
      reportCreateError(error);
    },
    onSettled: invalidate,
  });

  const createRecord = api.records.create.useMutation({
    onMutate: async (input): Promise<MutationContext> => {
      const context = await snapshot();
      const tempId = createTempId();
      const nowIso = new Date().toISOString();
      const tempRecord: RecordListItem = {
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
        deleted_at: null,
        created_at: nowIso,
        updated_at: nowIso,
      };
      insertIntoMatchingLists('records', tempRecord);
      return { ...context, tempId };
    },
    onSuccess: (created, _input, context) => {
      if (!created) return;
      insertIntoMatchingLists('records', created, context?.tempId);
    },
    onError: (error, _input, context) => {
      restore(context);
      reportCreateError(error);
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

  const updateRecord = api.records.update.useMutation({
    onMutate: async (input): Promise<MutationContext> => {
      const context = await snapshot();
      const patch = (row: RecordListItem): RecordListItem => ({
        ...row,
        ...(input.data.title !== undefined ? { title: input.data.title } : {}),
        ...(input.data.note !== undefined ? { note: input.data.note ?? null } : {}),
        ...(input.data.tagId !== undefined ? { tag_id: input.data.tagId ?? null } : {}),
        ...(input.data.start_at !== undefined ? { start_at: input.data.start_at } : {}),
        ...(input.data.end_at !== undefined ? { end_at: input.data.end_at } : {}),
      });
      patchMatchingLists('records', input.id, patch);
      utils.records.getById.setData({ id: input.id }, (old) => (old ? patch(old) : old));
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

  const deleteRecord = api.records.delete.useMutation({
    onMutate: async (input): Promise<MutationContext> => {
      const context = await snapshot();
      queryClient.setQueriesData<RecordListItem[]>({ predicate: isRecordsListQuery }, (old) =>
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

  const restoreRecord = api.records.restore.useMutation({
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
    createRecord,
    createPlan,
    deleteRecord,
    deletePlan,
    restoreRecord,
    restorePlan,
    skipPlan,
    unskipPlan,
    updateRecord,
    updatePlan,
  };
}
