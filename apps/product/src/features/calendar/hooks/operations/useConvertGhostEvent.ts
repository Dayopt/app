'use client';

import { useCallback } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { type ExternalCalendarEvent } from '@/features/external-calendar';
import { useTimeblockWriteMutations } from '@/features/timeblock';
import { toast } from '@/lib/toast';
import { api } from '@/lib/trpc';

/**
 * ghost（外部カレンダーの未変換予定）を Plan / Record へ変換する、および dismiss する（#1985, #1984）。
 *
 * 新規の DB write ロジックは書かない。`useTimeblockWriteMutations` の `createPlan` /
 * `createRecord`（`externalCalendarEventId` 対応済み・optimistic update 完備）と
 * `externalCalendar.dismissEvent`（proProcedure、#1984）をそのまま呼ぶ。この hook が足すのは
 * 「どちらに変換するか」の判定と、ghost 一覧（`externalCalendar.listEvents`）側の
 * optimistic な即時除去だけ — plans/records 側のキャッシュ操作は `useTimeblockWriteMutations`
 * に任せる。
 *
 * Plan / Record の判定は `event.endDate` と現在時刻だけで一意に決まる
 * （`ensurePlanCanBeCreated` は `end_at > now`、`ensureRecordCanBeCreated` は `end_at <= now`
 * を要求し、互いに排他的）。メニュー UI は不要。
 */
function isPastGhost(event: ExternalCalendarEvent): boolean {
  return event.endDate.getTime() <= Date.now();
}

/** tRPC の listEvents query key（あらゆる range 入力）にマッチする predicate。 */
function isGhostListQuery(query: { queryKey: unknown }): boolean {
  const key = query.queryKey;
  return (
    Array.isArray(key) &&
    Array.isArray(key[0]) &&
    key[0][0] === 'externalCalendar' &&
    key[0][1] === 'listEvents'
  );
}

interface GhostListRow {
  id: string;
}

export function useConvertGhostEvent() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const utils = api.useUtils();
  const { createPlan, createRecord, deletePlan, deleteRecord } = useTimeblockWriteMutations();

  /** 変換済み・dismiss 済みの ghost を全 range のキャッシュから即時除去する。 */
  const removeGhostFromCache = useCallback(
    (eventId: string) => {
      queryClient.setQueriesData<GhostListRow[]>({ predicate: isGhostListQuery }, (old) =>
        old?.filter((row) => row.id !== eventId),
      );
    },
    [queryClient],
  );

  const invalidateGhosts = useCallback(() => {
    void utils.externalCalendar.listEvents.invalidate();
  }, [utils]);

  const convertGhost = useCallback(
    (event: ExternalCalendarEvent) => {
      removeGhostFromCache(event.id);

      const input = {
        title: event.title ?? t('calendar.external.untitled'),
        externalCalendarEventId: event.id,
        start_at: event.startDate.toISOString(),
        end_at: event.endDate.toISOString(),
      };

      const target = isPastGhost(event) ? 'record' : 'plan';
      const mutation = target === 'record' ? createRecord : createPlan;

      mutation.mutate(input, {
        onSuccess: (created) => {
          const undo =
            target === 'record'
              ? () =>
                  deleteRecord.mutateAsync({
                    id: created.id,
                    expectedUpdatedAt: created.updated_at,
                  })
              : () =>
                  deletePlan.mutateAsync({ id: created.id, expectedUpdatedAt: created.updated_at });

          toast.success(
            target === 'record'
              ? t('calendar.external.toast.convertedToRecord')
              : t('calendar.external.toast.convertedToPlan'),
            {
              action: {
                label: t('common.undo'),
                onClick: () => {
                  void undo()
                    .then(() => {
                      invalidateGhosts();
                      toast.success(t('calendar.external.toast.convertUndone'));
                    })
                    .catch(() => undefined);
                },
              },
            },
          );
        },
        onError: () => {
          // 二重変換 race（TIME_OVERLAP 等）を含め、失敗時は ghost 一覧を再取得して
          // 実際の DB 状態に合わせる（optimistic 除去のロールバックはこの invalidate が兼ねる）。
          invalidateGhosts();
          toast.error(t('calendar.external.toast.convertFailed'));
        },
      });
    },
    [createPlan, createRecord, deletePlan, deleteRecord, invalidateGhosts, removeGhostFromCache, t],
  );

  const dismissEvent = api.externalCalendar.dismissEvent.useMutation({ retry: false });

  const dismissGhost = useCallback(
    async (event: ExternalCalendarEvent) => {
      removeGhostFromCache(event.id);
      try {
        await dismissEvent.mutateAsync({ eventId: event.id, dismissed: true });
      } catch {
        invalidateGhosts();
        toast.error(t('calendar.external.toast.dismissFailed'));
      }
    },
    [dismissEvent, invalidateGhosts, removeGhostFromCache, t],
  );

  return {
    convertGhost,
    dismissGhost,
    isConverting: createPlan.isPending || createRecord.isPending,
    isDismissing: dismissEvent.isPending,
  };
}
