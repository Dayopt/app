/**
 * Entry Mutations Hook（作成・更新・削除）
 *
 * entries テーブルに対する全操作を一元管理
 * - Toast通知
 * - キャッシュ無効化（全ビュー自動更新）
 * - Zustandキャッシュ（即座の同期）
 * - エラーハンドリング
 * - 楽観的更新
 */

import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { api } from '@/platform/trpc';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { clearNew, markNew } from '../lib/new-entry-tracker';
import type { UpdateEntryInput } from '../schemas/entry';
import { useEntryInspectorStore } from '../stores/useEntryInspectorStore';
import { createListQueryPredicate, createTempId } from './mutations/mutationUtils';

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
export function useEntryMutations(options?: { suppressCreateToast?: boolean }) {
  const suppressCreateToast = options?.suppressCreateToast ?? false;
  const t = useTranslations();
  const queryClient = useQueryClient();
  const utils = api.useUtils();
  const closeInspector = useEntryInspectorStore((s) => s.closeInspector);
  const openInspector = useEntryInspectorStore((s) => s.openInspector);

  // 作成（楽観的更新付き）
  const createEntry = api.entries.create.useMutation({
    onMutate: async (input) => {
      logger.debug('[mutation:create] onMutate', { title: input.title });
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
        backed_up_start_time: null,
        backed_up_end_time: null,
        duration_minutes: input.duration_minutes ?? null,
        fulfillment_score: input.fulfillment_score ?? null,
        reminder_minutes: input.reminder_minutes ?? null,
        reminder_at: null,
        reminder_sent: false,
        reviewed_at: null,
        deleted_at: null,
        user_id: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tagId: input.tagId ?? null,
      };

      // 新規作成アニメーション用にマーク（キャッシュ更新前に設定 → 再レンダー時に即反映）
      markNew(tempId);

      // 楽観的にキャッシュを更新（日付フィルター付きキャッシュも含む全て）
      queryClient.setQueriesData<EntryListData>({ predicate: isEntriesListQuery }, (oldData) => {
        if (!oldData) return [tempEntry];
        return [...oldData, tempEntry];
      });

      return { previousEntriesList, tempId };
    },
    onSuccess: (newEntry, input, context) => {
      logger.debug('[mutation:create] onSuccess', { id: newEntry.id });

      // 新規作成アニメーション: tempIdのマークをクリア（アニメーションは楽観的更新時に1回だけ発火）
      if (context?.tempId) {
        clearNew(context.tempId);
      }
      // 一時エントリを本来のエントリに置換（全キャッシュ対象）
      // entries.create はタグなし EntryRow を返すため、tagId を補完して EntryWithTags に昇格
      const newEntryWithTagId: Awaited<ReturnType<typeof utils.entries.list.fetch>>[number] = {
        ...newEntry,
        tagId: input.tagId ?? null,
      };
      type EntryListData = Awaited<ReturnType<typeof utils.entries.list.fetch>>;

      queryClient.setQueriesData<EntryListData>({ predicate: isEntriesListQuery }, (oldData) => {
        if (!oldData) return [newEntryWithTagId];
        return oldData
          .filter((e) => e.id !== context?.tempId && e.id !== newEntry.id)
          .concat(newEntryWithTagId);
      });

      // 初回作成時: Inspector自動表示（toast非表示）
      // 2個目以降: toastで通知
      const allEntries = utils.entries.list.getData();
      const isFirstEntry = allEntries && allEntries.length <= 1;

      if (isFirstEntry) {
        openInspector(newEntry.id);
      } else if (!suppressCreateToast) {
        const displayTitle = newEntry.title || t('entry.untitled');
        toast.success(t('entry.toast.created', { title: displayTitle }), {
          action: {
            label: t('entry.editDetails'),
            onClick: () => {
              openInspector(newEntry.id);
            },
          },
        });
      }

      // 個別エントリのキャッシュを設定
      utils.entries.getById.setData(
        { id: newEntry.id },
        { ...newEntry, tagId: input.tagId ?? null },
      );
    },
    onError: (error, _input, context) => {
      logger.error('[mutation:create] onError', error);

      // 新規作成アニメーションをクリア
      if (context?.tempId) {
        clearNew(context.tempId);
      }

      // エラー時: 全ての entries.list キャッシュをロールバック
      if (context?.previousEntriesList) {
        for (const [queryKey, data] of context.previousEntriesList) {
          queryClient.setQueryData(queryKey, data);
        }
      }

      // TIME_OVERLAPエラー（重複防止）
      if (
        error.message.includes('既にエントリがあります') ||
        error.message.includes('TIME_OVERLAP')
      ) {
        toast.error(t('entry.toast.timeOverlap'));
        return;
      }

      const errorMessage = error.message.includes('validation.')
        ? t(error.message as Parameters<typeof t>[0])
        : error.message;
      toast.error(t('entry.toast.createFailed', { error: errorMessage }));
    },
    onSettled: () => {
      void utils.entries.list.invalidate();
      void utils.history.getRecentBlocks.invalidate();
    },
  });

  // 更新
  const updateEntry = api.entries.update.useMutation({
    onMutate: async ({ id, data }) => {
      logger.debug('[mutation:update] onMutate', { id, fields: Object.keys(data) });

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

      if (data.start_time !== undefined) updateData.start_time = data.start_time;
      if (data.end_time !== undefined) updateData.end_time = data.end_time;
      if (data.actual_start_time !== undefined)
        updateData.actual_start_time = data.actual_start_time;
      if (data.actual_end_time !== undefined) updateData.actual_end_time = data.actual_end_time;
      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.reminder_minutes !== undefined) updateData.reminder_minutes = data.reminder_minutes;
      if (data.fulfillment_score !== undefined)
        updateData.fulfillment_score = data.fulfillment_score;
      if (data.duration_minutes !== undefined) updateData.duration_minutes = data.duration_minutes;
      if (data.origin !== undefined) updateData.origin = data.origin;

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
      logger.debug('[mutation:update] onSuccess', { id: variables.id });
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

      // entries.getById キャッシュも最新データで更新（楽観的ロック用 updated_at を含む）
      utils.entries.getById.setData({ id: variables.id }, (oldData) => {
        if (!oldData) return undefined;
        return { ...oldData, ...updatedEntry };
      });
      utils.entries.getById.setData({ id: variables.id, include: { tags: true } }, (oldData) => {
        if (!oldData) return undefined;
        return { ...oldData, ...updatedEntry };
      });

      // 自動保存（title、description、日時など）はtoast非表示
    },
    onError: (err, _variables, context) => {
      logger.error('[mutation:update] onError', err);

      // 競合検出（楽観的ロック）: 他タブ/デバイスで変更されたエントリ
      if (err.data?.code === 'CONFLICT') {
        toast.error(t('entry.toast.conflict'), {
          action: {
            label: t('common.reload'),
            onClick: () => {
              if (context?.id) {
                void utils.entries.list.invalidate();
                void utils.entries.getById.invalidate({ id: context.id });
              }
            },
          },
        });
      } else if (
        err.message.includes('既にエントリがあります') ||
        err.message.includes('TIME_OVERLAP')
      ) {
        toast.error(t('entry.toast.timeOverlap'));
      } else {
        toast.error(t('entry.toast.updateFailed'));
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
      void utils.entries.list.invalidate();
      void utils.history.getRecentBlocks.invalidate();
    },
  });

  // 復元（Undo用 — soft-deleteされたエントリのdeleted_atをクリア）
  const restoreEntry = api.entries.restore.useMutation({
    onSuccess: (_, { id }) => {
      logger.debug('[mutation:restore] onSuccess', { id });
      toast.success(t('entry.toast.restored'));
      void utils.entries.list.invalidate(undefined, { refetchType: 'all' });
      void utils.entries.getById.invalidate({ id }, { refetchType: 'all' });
    },
    onError: (error) => {
      logger.error('[mutation:restore] onError', error);
      toast.error(t('entry.toast.restoreFailed'));
    },
  });

  // 削除（soft-delete）
  const deleteEntry = api.entries.delete.useMutation({
    onMutate: async ({ id }) => {
      logger.debug('[mutation:delete] onMutate', { id });

      await utils.entries.list.cancel();
      await utils.entries.getById.cancel({ id });

      // スナップショット（全キャッシュ対象 — 日付フィルター付きビューも含む）
      type EntryListData = Awaited<ReturnType<typeof utils.entries.list.fetch>>;
      const previousEntriesList = queryClient.getQueriesData<EntryListData>({
        predicate: isEntriesListQuery,
      });
      const previousEntries = utils.entries.list.getData();
      const previousEntry =
        utils.entries.getById.getData({ id }) ?? previousEntries?.find((e) => e.id === id);

      // 楽観的更新: リストから即座に削除（全キャッシュ対象）
      queryClient.setQueriesData<EntryListData>({ predicate: isEntriesListQuery }, (oldData) => {
        if (!oldData) return oldData;
        return oldData.filter((entry) => entry.id !== id);
      });

      // undo付きtoast（soft-deleteなのでrestore APIで同一ID・タグを完全復元）
      const displayTitle = previousEntry?.title || t('entry.untitled');
      toast.success(t('entry.toast.deleted', { title: displayTitle }), {
        duration: 6000,
        action: {
          label: t('common.undo'),
          onClick: () => {
            restoreEntry.mutate({ id });
          },
        },
      });

      closeInspector();

      return { id, previousEntriesList, previousEntry };
    },
    onSuccess: (_, { id }) => {
      logger.debug('[mutation:delete] onSuccess', { id });
      void utils.entries.list.invalidate(undefined, { refetchType: 'all' });
      void utils.entries.getById.invalidate({ id }, { refetchType: 'all' });
      void utils.history.getRecentBlocks.invalidate();
    },
    onError: (error, { id }, context) => {
      logger.error('[mutation:delete] onError', error);
      toast.error(t('entry.toast.deleteFailed', { error: error.message }));

      // エラー時: 全ての entries.list キャッシュをロールバック
      if (context?.previousEntriesList) {
        for (const [queryKey, data] of context.previousEntriesList) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      if (context?.previousEntry) {
        utils.entries.getById.setData({ id }, context.previousEntry);
      }
    },
  });

  // 一括更新
  const bulkUpdateEntries = api.entries.bulkUpdate.useMutation({
    onMutate: async ({ ids, data }) => {
      logger.debug('[mutation:bulkUpdate] onMutate', { count: ids.length });
      await utils.entries.list.cancel();

      // スナップショット（全キャッシュ対象）
      type EntryListData = Awaited<ReturnType<typeof utils.entries.list.fetch>>;
      const previousEntriesList = queryClient.getQueriesData<EntryListData>({
        predicate: isEntriesListQuery,
      });

      queryClient.setQueriesData<EntryListData>({ predicate: isEntriesListQuery }, (oldData) => {
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

      return { previousEntriesList };
    },
    onSuccess: (result) => {
      toast.success(t('entry.toast.bulkUpdated', { count: result.count }));
      void utils.entries.list.invalidate(undefined, { refetchType: 'active' });
    },
    onError: (error, _variables, context) => {
      toast.error(t('entry.toast.bulkUpdateFailed', { error: error.message }));
      if (context?.previousEntriesList) {
        for (const [queryKey, data] of context.previousEntriesList) {
          queryClient.setQueryData(queryKey, data);
        }
      }
    },
  });

  // 一括削除
  const bulkDeleteEntries = api.entries.bulkDelete.useMutation({
    onMutate: async ({ ids }) => {
      logger.debug('[mutation:bulkDelete] onMutate', { count: ids.length });
      await utils.entries.list.cancel();

      // スナップショット（全キャッシュ対象）
      type EntryListData = Awaited<ReturnType<typeof utils.entries.list.fetch>>;
      const previousEntriesList = queryClient.getQueriesData<EntryListData>({
        predicate: isEntriesListQuery,
      });

      queryClient.setQueriesData<EntryListData>({ predicate: isEntriesListQuery }, (oldData) => {
        if (!oldData) return oldData;
        return oldData.filter((entry) => !ids.includes(entry.id));
      });

      return { previousEntriesList };
    },
    onSuccess: (result) => {
      toast.success(t('entry.toast.bulkDeleted', { count: result.count }));
      closeInspector();
      void utils.entries.list.invalidate(undefined, { refetchType: 'all' });
    },
    onError: (error, _variables, context) => {
      toast.error(t('entry.toast.bulkDeleteFailed', { error: error.message }));
      if (context?.previousEntriesList) {
        for (const [queryKey, data] of context.previousEntriesList) {
          queryClient.setQueryData(queryKey, data);
        }
      }
    },
  });

  // 一括タグ追加（楽観的更新付き）
  const bulkAddTags = api.entries.bulkAddTags.useMutation({
    onMutate: async ({ entryIds, tagId }) => {
      await utils.entries.list.cancel();
      const previousEntries = utils.entries.list.getData();

      utils.entries.list.setData(undefined, (oldData) => {
        if (!oldData) return oldData;
        return oldData.map((entry) => {
          if (entryIds.includes(entry.id)) {
            return { ...entry, tagId };
          }
          return entry;
        });
      });

      return { previousEntries };
    },
    onSuccess: () => {
      toast.success(t('entry.toast.tagsAdded'));
      void utils.entries.list.invalidate(undefined, { refetchType: 'all' });
      void utils.entries.getTagStats.invalidate();
    },
    onError: (error, _variables, context) => {
      if (context?.previousEntries) {
        utils.entries.list.setData(undefined, context.previousEntries);
      }
      toast.error(t('entry.toast.tagsAddFailed', { error: error.message }));
    },
  });

  return {
    createEntry,
    updateEntry,
    restoreEntry,
    deleteEntry,
    bulkUpdateEntries,
    bulkDeleteEntries,
    bulkAddTags,
  };
}

// 型エクスポート
export type { CreateEntryInput, UpdateEntryInput } from '../schemas/entry';
