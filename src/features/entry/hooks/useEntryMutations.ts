/**
 * Entry Mutations Hook（作成・更新・削除）
 *
 * plans + records を統合した entries テーブルに対する全操作を一元管理
 * - Toast通知
 * - キャッシュ無効化（全ビュー自動更新）
 * - Zustandキャッシュ（即座の同期）
 * - エラーハンドリング
 * - 楽観的更新
 */

import { logger } from '@/lib/logger';
import { api } from '@/platform/trpc';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { UpdateEntryInput } from '../schemas/entry';
import { useEntryCacheStore } from '../stores/useEntryCacheStore';
import { useEntryInspectorStore } from '../stores/useEntryInspectorStore';
import {
  createListQueryPredicate,
  createTempId,
  normalizeDateTime,
} from './mutations/mutationUtils';

/**
 * entries.list クエリキーにマッチする predicate
 */
const isEntriesListQuery = createListQueryPredicate('entries');

/**
 * Entry Mutations Hook
 *
 * @example
 * ```tsx
 * const { createEntry, updateEntry, deleteEntry } = useEntryMutations()
 *
 * // 作成（origin は start_time から自動判定）
 * createEntry.mutate({ title: 'ミーティング', start_time: '...', end_time: '...' })
 *
 * // 更新
 * updateEntry.mutate({ id: '123', data: { title: 'Updated' } })
 *
 * // 削除
 * deleteEntry.mutate({ id: '123' })
 * ```
 */
export function useEntryMutations() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const utils = api.useUtils();
  const closeInspector = useEntryInspectorStore((s) => s.closeInspector);
  const openInspector = useEntryInspectorStore((s) => s.openInspector);
  const setIsMutating = useEntryCacheStore((s) => s.setIsMutating);

  // 作成（楽観的更新付き）
  const createEntry = api.entries.create.useMutation({
    onMutate: async (input) => {
      // 進行中のクエリをキャンセル
      await utils.entries.list.cancel();

      // 現在のデータをスナップショット（ロールバック用）
      type EntryListData = Awaited<ReturnType<typeof utils.entries.list.fetch>>;
      const previousEntriesList = queryClient.getQueriesData<EntryListData>({
        predicate: isEntriesListQuery,
      });

      // 一時的なエントリを作成（IDは仮）
      const tempId = createTempId();
      const origin = input.origin ?? 'planned';
      const tempEntry: Awaited<ReturnType<typeof utils.entries.list.fetch>>[number] = {
        id: tempId,
        title: input.title,
        description: input.description ?? null,
        origin,
        start_time: input.start_time ?? null,
        end_time: input.end_time ?? null,
        actual_start_time: null,
        actual_end_time: null,
        duration_minutes: input.duration_minutes ?? null,
        fulfillment_score: input.fulfillment_score ?? null,
        recurrence_type: input.recurrence_type ?? null,
        recurrence_rule: input.recurrence_rule ?? null,
        recurrence_end_date: null,
        reminder_minutes: input.reminder_minutes ?? null,
        reminder_at: null,
        reminder_sent: false,
        reviewed_at: null,
        user_id: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tagId: null,
      };

      // 楽観的にキャッシュを更新（日付フィルター付きキャッシュも含む全て）
      queryClient.setQueriesData<EntryListData>({ predicate: isEntriesListQuery }, (oldData) => {
        if (!oldData) return [tempEntry];
        return [...oldData, tempEntry];
      });

      return { previousEntriesList, tempId };
    },
    onSuccess: (newEntry, _input, context) => {
      // 一時エントリを本来のエントリに置換（全キャッシュ対象）
      // entries.create はタグなし EntryRow を返すため、tagId を補完して EntryWithTags に昇格
      const newEntryWithTagId: Awaited<ReturnType<typeof utils.entries.list.fetch>>[number] = {
        ...newEntry,
        tagId: null,
      };
      type EntryListData = Awaited<ReturnType<typeof utils.entries.list.fetch>>;

      queryClient.setQueriesData<EntryListData>({ predicate: isEntriesListQuery }, (oldData) => {
        if (!oldData) return [newEntryWithTagId];
        return oldData
          .filter((e) => e.id !== context?.tempId && e.id !== newEntry.id)
          .concat(newEntryWithTagId);
      });

      // Toast通知
      const displayTitle = newEntry.title || t('entry.untitled');
      toast.success(t('plan.toast.created', { title: displayTitle }), {
        action: {
          label: t('plan.open'),
          onClick: () => {
            openInspector(newEntry.id);
          },
        },
      });

      // 個別エントリのキャッシュを設定
      utils.entries.getById.setData({ id: newEntry.id }, { ...newEntry, tagId: null });
    },
    onError: (error, _input, context) => {
      logger.error('[useEntryMutations] Create error:', error);

      // エラー時: 全ての entries.list キャッシュをロールバック
      if (context?.previousEntriesList) {
        for (const [queryKey, data] of context.previousEntriesList) {
          queryClient.setQueryData(queryKey, data);
        }
      }

      // TIME_OVERLAPエラー（重複防止）
      if (error.message.includes('既に予定があります') || error.message.includes('TIME_OVERLAP')) {
        toast.error(t('plan.toast.timeOverlap'));
        return;
      }

      const errorMessage = error.message.includes('validation.')
        ? t(error.message as Parameters<typeof t>[0])
        : error.message;
      toast.error(t('plan.toast.createFailed', { error: errorMessage }));
    },
    onSettled: () => {
      void utils.entries.list.invalidate();
    },
  });

  // 更新
  const updateEntry = api.entries.update.useMutation({
    onMutate: async ({ id, data }) => {
      // 0. mutation開始フラグを設定（Realtime二重更新防止）
      setIsMutating(true);

      // 1. 進行中のクエリをキャンセル（競合回避）
      await utils.entries.list.cancel();
      await utils.entries.getById.cancel({ id });

      // 2. 現在のデータをスナップショット（ロールバック用）
      type EntryListData = Awaited<ReturnType<typeof utils.entries.list.fetch>>;
      const previousEntriesList = queryClient.getQueriesData<EntryListData>({
        predicate: isEntriesListQuery,
      });
      const previousEntry = utils.entries.getById.getData({ id });

      // 3. 楽観的更新: TanStack Queryキャッシュを更新
      const updateData: UpdateEntryInput = {};

      if (data.recurrence_type !== undefined) updateData.recurrence_type = data.recurrence_type;
      if (data.recurrence_rule !== undefined) updateData.recurrence_rule = data.recurrence_rule;
      if (data.start_time !== undefined) updateData.start_time = data.start_time;
      if (data.end_time !== undefined) updateData.end_time = data.end_time;
      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.reminder_minutes !== undefined) updateData.reminder_minutes = data.reminder_minutes;
      if (data.fulfillment_score !== undefined)
        updateData.fulfillment_score = data.fulfillment_score;
      if (data.duration_minutes !== undefined) updateData.duration_minutes = data.duration_minutes;
      if (data.origin !== undefined) updateData.origin = data.origin;
      if (data.actual_start_time !== undefined)
        updateData.actual_start_time = data.actual_start_time;
      if (data.actual_end_time !== undefined) updateData.actual_end_time = data.actual_end_time;

      // 4. TanStack Queryキャッシュを楽観的に更新
      // キャッシュ間移動対応: エントリが存在するキャッシュからフルデータを取得
      let fullEntryForCrossCache: EntryListData[0] | undefined;
      if (data.start_time !== undefined) {
        for (const [, cacheData] of previousEntriesList) {
          if (cacheData) {
            fullEntryForCrossCache = cacheData.find((e) => e.id === id);
            if (fullEntryForCrossCache) break;
          }
        }
      }

      queryClient.setQueriesData<EntryListData>({ predicate: isEntriesListQuery }, (oldData) => {
        if (!oldData) return oldData;
        const exists = oldData.some((entry) => entry.id === id);
        if (exists) {
          return oldData.map((entry) =>
            entry.id === id ? (Object.assign({}, entry, updateData) as typeof entry) : entry,
          );
        }
        // エントリがこのキャッシュに無い場合、start_time設定時は追加（キャッシュ間移動）
        if (fullEntryForCrossCache && data.start_time !== undefined) {
          return [
            ...oldData,
            Object.assign({}, fullEntryForCrossCache, updateData) as typeof fullEntryForCrossCache,
          ];
        }
        return oldData;
      });

      // 個別エントリキャッシュを更新（tagsなし/あり両方）
      utils.entries.getById.setData({ id }, (oldData) => {
        if (!oldData) return undefined;
        return Object.assign({}, oldData, updateData);
      });
      utils.entries.getById.setData({ id, include: { tags: true } }, (oldData) => {
        if (!oldData) return undefined;
        return Object.assign({}, oldData, updateData);
      });

      return { id, previousEntriesList, previousEntry };
    },
    onSuccess: (result, variables) => {
      // サーバーから返ってきた最新データでキャッシュを更新
      // adjustedEntries はキャッシュ操作用（リストに含めない）
      const { adjustedEntries, ...updatedEntry } = result;
      type EntryListData = Awaited<ReturnType<typeof utils.entries.list.fetch>>;
      queryClient.setQueriesData<EntryListData>({ predicate: isEntriesListQuery }, (oldData) => {
        if (!oldData) return oldData;

        let updated = oldData;

        // 自エントリのキャッシュを更新
        const exists = updated.some((entry) => entry.id === variables.id);
        if (exists) {
          updated = updated.map((entry) => {
            if (entry.id === variables.id) {
              return { ...updatedEntry, tagId: entry.tagId ?? null };
            }
            return entry;
          });
        } else if (updatedEntry.start_time) {
          updated = [...updated, { ...updatedEntry, tagId: null }];
        }

        // auto-shrink で調整された隣接エントリのキャッシュも更新
        if (adjustedEntries.length > 0) {
          updated = updated.map((entry) => {
            const adjusted = adjustedEntries.find((a) => a.id === entry.id);
            if (adjusted) {
              return { ...entry, ...adjusted };
            }
            return entry;
          });
        }

        return updated;
      });

      // 自動保存（title、description、日時など）はtoast非表示
    },
    onError: (err, _variables, context) => {
      if (err.message.includes('既に予定があります') || err.message.includes('TIME_OVERLAP')) {
        toast.error(t('plan.toast.timeOverlap'));
      } else {
        toast.error(t('plan.toast.updateFailed'));
      }

      // エラー時: 全ての entries.list キャッシュをロールバック
      if (context?.previousEntriesList) {
        for (const [queryKey, data] of context.previousEntriesList) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      if (context?.previousEntry) {
        utils.entries.getById.setData({ id: context.id }, context.previousEntry);
      }
    },
    onSettled: async () => {
      setIsMutating(false);
      void utils.entries.list.invalidate();
    },
  });

  // 削除
  const deleteEntry = api.entries.delete.useMutation({
    onMutate: async ({ id }) => {
      setIsMutating(true);

      await utils.entries.list.cancel();
      await utils.entries.getById.cancel({ id });

      // スナップショット
      const previousEntries = utils.entries.list.getData();
      const previousEntry =
        utils.entries.getById.getData({ id }) ?? previousEntries?.find((e) => e.id === id);

      // 楽観的更新: リストから即座に削除（全キャッシュ対象）
      type EntryListData = Awaited<ReturnType<typeof utils.entries.list.fetch>>;
      queryClient.setQueriesData<EntryListData>({ predicate: isEntriesListQuery }, (oldData) => {
        if (!oldData) return oldData;
        return oldData.filter((entry) => entry.id !== id);
      });

      // undo付きtoast
      if (previousEntry) {
        const restoreData = {
          title: previousEntry.title,
          description: previousEntry.description ?? undefined,
          origin: previousEntry.origin as 'planned' | undefined,
          start_time: normalizeDateTime(previousEntry.start_time),
          end_time: normalizeDateTime(previousEntry.end_time),
          reminder_minutes: previousEntry.reminder_minutes ?? undefined,
          recurrence_type:
            (previousEntry.recurrence_type as
              | 'none'
              | 'daily'
              | 'weekly'
              | 'monthly'
              | 'yearly'
              | 'weekdays') ?? undefined,
          recurrence_rule: previousEntry.recurrence_rule ?? undefined,
          fulfillment_score: previousEntry.fulfillment_score ?? undefined,
        };

        const displayTitle = previousEntry.title || t('entry.untitled');
        toast.success(t('plan.toast.deleted', { title: displayTitle }), {
          duration: 10000,
          action: {
            label: t('common.undo'),
            onClick: () => {
              createEntry.mutate(restoreData);
            },
          },
        });
      } else {
        toast.success(t('plan.toast.deleted'));
      }

      closeInspector();

      return { id, previousEntries, previousEntry };
    },
    onSuccess: (_, { id }) => {
      void utils.entries.list.invalidate(undefined, { refetchType: 'all' });
      void utils.entries.getById.invalidate({ id }, { refetchType: 'all' });
    },
    onError: (error, { id }, context) => {
      toast.error(t('plan.toast.deleteFailed', { error: error.message }));

      if (context?.previousEntries) {
        utils.entries.list.setData(undefined, context.previousEntries);
      }
      if (context?.previousEntry) {
        utils.entries.getById.setData({ id }, context.previousEntry);
      }
    },
    onSettled: () => {
      setTimeout(() => {
        setIsMutating(false);
      }, 500);
    },
  });

  // 一括更新
  const bulkUpdateEntries = api.entries.bulkUpdate.useMutation({
    onMutate: async ({ ids, data }) => {
      setIsMutating(true);
      await utils.entries.list.cancel();
      const previousEntries = utils.entries.list.getData();

      utils.entries.list.setData(undefined, (oldData) => {
        if (!oldData) return oldData;
        return oldData.map((entry) => {
          if (!ids.includes(entry.id)) return entry;
          return {
            ...entry,
            ...(data.title !== undefined && { title: data.title }),
            ...(data.description !== undefined && { description: data.description }),
            ...(data.start_time !== undefined && { start_time: data.start_time }),
            ...(data.end_time !== undefined && { end_time: data.end_time }),
            ...(data.fulfillment_score !== undefined && {
              fulfillment_score: data.fulfillment_score,
            }),
            updated_at: new Date().toISOString(),
          } as typeof entry;
        });
      });

      return { previousEntries };
    },
    onSuccess: (result) => {
      toast.success(t('plan.toast.bulkUpdated', { count: result.count }));
      void utils.entries.list.invalidate(undefined, { refetchType: 'active' });
    },
    onError: (error, _variables, context) => {
      toast.error(t('plan.toast.bulkUpdateFailed', { error: error.message }));
      if (context?.previousEntries) {
        utils.entries.list.setData(undefined, context.previousEntries);
      }
    },
    onSettled: () => {
      setIsMutating(false);
    },
  });

  // 一括削除
  const bulkDeleteEntries = api.entries.bulkDelete.useMutation({
    onMutate: async ({ ids }) => {
      setIsMutating(true);
      await utils.entries.list.cancel();
      const previousEntries = utils.entries.list.getData();

      utils.entries.list.setData(undefined, (oldData) => {
        if (!oldData) return oldData;
        return oldData.filter((entry) => !ids.includes(entry.id));
      });

      return { previousEntries };
    },
    onSuccess: (result) => {
      toast.success(t('plan.toast.bulkDeleted', { count: result.count }));
      closeInspector();
      void utils.entries.list.invalidate(undefined, { refetchType: 'all' });
    },
    onError: (error, _variables, context) => {
      toast.error(t('plan.toast.bulkDeleteFailed', { error: error.message }));
      if (context?.previousEntries) {
        utils.entries.list.setData(undefined, context.previousEntries);
      }
    },
    onSettled: () => {
      setIsMutating(false);
    },
  });

  // 一括タグ追加（楽観的更新付き）
  const bulkAddTags = api.entries.bulkAddTags.useMutation({
    onMutate: async ({ entryIds, tagIds }) => {
      await utils.entries.list.cancel();
      const previousEntries = utils.entries.list.getData();

      utils.entries.list.setData(undefined, (oldData) => {
        if (!oldData) return oldData;
        // 1エントリ1タグ制約: tagIdsの最後のタグを設定
        const newTagId = tagIds[tagIds.length - 1] ?? null;
        return oldData.map((entry) => {
          if (entryIds.includes(entry.id)) {
            return {
              ...entry,
              tagId: newTagId,
            };
          }
          return entry;
        });
      });

      return { previousEntries };
    },
    onSuccess: () => {
      toast.success(t('plan.toast.tagsAdded'));
      void utils.entries.list.invalidate(undefined, { refetchType: 'all' });
      void utils.entries.getTagStats.invalidate();
    },
    onError: (error, _variables, context) => {
      if (context?.previousEntries) {
        utils.entries.list.setData(undefined, context.previousEntries);
      }
      toast.error(t('plan.toast.tagsAddFailed', { error: error.message }));
    },
  });

  return {
    createEntry,
    updateEntry,
    deleteEntry,
    bulkUpdateEntries,
    bulkDeleteEntries,
    bulkAddTags,
  };
}

// 型エクスポート
export type { CreateEntryInput, UpdateEntryInput } from '../schemas/entry';
