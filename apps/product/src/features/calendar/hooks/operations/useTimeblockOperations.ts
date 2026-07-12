import { useCallback } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { resolveTimeblockDestination, useTimeblockWriteMutations } from '@/features/timeblock';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';

import type { TimeblockDestination } from '@/features/timeblock';
import type { CalendarEvent } from '../../types/calendar.types';

interface TimeModelCacheRow {
  id: string;
  start_at: string;
  end_at: string;
  updated_at: string;
}

function isLaneListQuery(lane: 'plans' | 'logs') {
  return (query: { queryKey: unknown }): boolean => {
    const key = query.queryKey;
    return (
      Array.isArray(key) && Array.isArray(key[0]) && key[0][0] === lane && key[0][1] === 'list'
    );
  };
}

function findRowInLane(
  queryClient: ReturnType<typeof useQueryClient>,
  lane: 'plans' | 'logs',
  id: string,
): TimeModelCacheRow | null {
  const lists = queryClient.getQueriesData<TimeModelCacheRow[]>({
    predicate: isLaneListQuery(lane),
  });
  for (const [, data] of lists) {
    const row = data?.find((candidate) => candidate.id === id);
    if (row) return row;
  }
  return null;
}

/** plans.list / logs.list キャッシュから id で 1 行探す。見つかった方が kind を決める。 */
function findTimeModelRowById(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
): { kind: TimeblockDestination; row: TimeModelCacheRow } | null {
  const planRow = findRowInLane(queryClient, 'plans', id);
  if (planRow) return { kind: 'plan', row: planRow };
  const logRow = findRowInLane(queryClient, 'logs', id);
  if (logRow) return { kind: 'log', row: logRow };
  return null;
}

/**
 * plan / log の CRUD（削除・時間更新）を提供するフック。
 *
 * カレンダーの DnD / リサイズ / キーボード削除は id だけを渡してくる（kind を持たない）ため、
 * plans.list / logs.list キャッシュから id を逆引きして kind を判定する。
 */
export const useTimeblockOperations = () => {
  const { deleteLog, deletePlan, updateLog, updatePlan } = useTimeblockWriteMutations();
  const queryClient = useQueryClient();
  const t = useTranslations();

  const showTimeChangeUndoToast = useCallback(
    (id: string, kind: TimeblockDestination, previous: { start_at: string; end_at: string }) => {
      toast.success(t('timeblock.toast.updated'), {
        duration: 6000,
        action: {
          label: t('common.undo'),
          onClick: () => {
            const data = { start_at: previous.start_at, end_at: previous.end_at };
            if (kind === 'plan') {
              updatePlan.mutate({ id, data });
            } else {
              updateLog.mutate({ id, data });
            }
          },
        },
      });
    },
    [updatePlan, updateLog, t],
  );

  // エントリー削除ハンドラー（id のみ。kind はキャッシュから逆引きする）
  const handleEntryDelete = useCallback(
    async (entryId: string) => {
      const found = findTimeModelRowById(queryClient, entryId);
      if (!found) {
        logger.error('エントリー削除に失敗: id がキャッシュに見つかりません', { entryId });
        return;
      }
      if (found.kind === 'plan') {
        deletePlan.mutate({ id: entryId });
      } else {
        deleteLog.mutate({ id: entryId });
      }
    },
    [queryClient, deletePlan, deleteLog],
  );

  // エントリー更新ハンドラー（ドラッグ&ドロップ / リサイズ用）
  const handleUpdateEntry = useCallback(
    async (
      entryIdOrEntry: string | CalendarEvent,
      updates?: {
        startTime: Date;
        endTime: Date;
        resetActualTime?: boolean;
      },
    ) => {
      const entryId = typeof entryIdOrEntry === 'string' ? entryIdOrEntry : entryIdOrEntry.id;
      const nextRange =
        typeof entryIdOrEntry === 'string'
          ? updates
            ? { start: updates.startTime, end: updates.endTime }
            : null
          : entryIdOrEntry.startDate && entryIdOrEntry.endDate
            ? { start: entryIdOrEntry.startDate, end: entryIdOrEntry.endDate }
            : null;

      if (!nextRange) {
        logger.error('startTime/endTimeが無いため更新できません:', entryId);
        return;
      }

      // kind が既知（CalendarEvent object 経由）ならそのレーンだけ、未知なら両レーンを探す。
      // previous 値は常にキャッシュ由来（渡された event 自身は更新後プレビューの可能性があるため）。
      const knownKind = typeof entryIdOrEntry !== 'string' ? entryIdOrEntry.kind : undefined;
      const found = knownKind
        ? {
            kind: knownKind,
            row: findRowInLane(queryClient, knownKind === 'plan' ? 'plans' : 'logs', entryId),
          }
        : findTimeModelRowById(queryClient, entryId);

      if (!found) {
        logger.error('エントリー更新に失敗: id がキャッシュに見つかりません', { entryId });
        return;
      }

      // 過去 plan は時間変更不可（server も PLAN_TIME_LOCKED で拒否するが、無駄な往復を避ける）
      if (
        found.kind === 'plan' &&
        found.row &&
        resolveTimeblockDestination(found.row.end_at) === 'log'
      ) {
        toast.error(t('timeblock.editor.timeLocked'));
        return;
      }
      // log は未来へ移動できない（記録は過去のみ）
      if (found.kind === 'log' && resolveTimeblockDestination(nextRange.end) === 'plan') {
        toast.error(t('timeblock.editor.timeLocked'));
        return;
      }

      const previous = found.row
        ? { start_at: found.row.start_at, end_at: found.row.end_at }
        : null;
      const data = { start_at: nextRange.start.toISOString(), end_at: nextRange.end.toISOString() };
      const onSuccess = () => {
        if (previous) showTimeChangeUndoToast(entryId, found.kind, previous);
      };

      if (found.kind === 'plan') {
        updatePlan.mutate({ id: entryId, data }, { onSuccess });
      } else {
        updateLog.mutate({ id: entryId, data }, { onSuccess });
      }
    },
    [queryClient, updatePlan, updateLog, showTimeChangeUndoToast, t],
  );

  return {
    handleEntryDelete,
    handleUpdateEntry,
  };
};
