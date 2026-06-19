import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { api } from '@/lib/trpc';
import { determineEntryOrigin } from '../../domain';
import { clearNew, markNew } from '../../lib/new-entry-tracker';
import { useFindSkippableAutoRecords } from '../useFindSkippableAutoRecords';
import { createTempId, isEntriesListQuery } from './mutationUtils';
import type { EntryMutationContext } from './useEntryMutationContext';
import type { useEntrySkipMutations } from './useEntrySkipMutations';

export function useCreateEntryMutation(
  context: EntryMutationContext,
  options: {
    suppressCreateToast: boolean;
    skipEntry: ReturnType<typeof useEntrySkipMutations>['skipEntry'];
  },
) {
  const { t, queryClient, utils, openInspector } = context;
  const { suppressCreateToast, skipEntry } = options;

  // 予定外記録の作成が TIME_OVERLAP で拒否された時、衝突相手が自動記録だけなら
  // スキップで一手解決できる entry ID を返す（カレンダーのドラッグ作成と共用）。
  const findSkippable = useFindSkippableAutoRecords();
  const findSkippableForInput = (input: {
    start_time?: string | null | undefined;
    end_time?: string | null | undefined;
    actual_start_time?: string | null | undefined;
    actual_end_time?: string | null | undefined;
  }): string[] => {
    const startIso = input.actual_start_time ?? input.start_time;
    const endIso = input.actual_end_time ?? input.end_time;
    if (!startIso || !endIso) return [];
    return findSkippable(new Date(startIso).getTime(), new Date(endIso).getTime());
  };

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
      const selectedStart = input.start_time ?? input.actual_start_time ?? null;
      const selectedEnd = input.end_time ?? input.actual_end_time ?? null;
      const origin = selectedEnd ? determineEntryOrigin(selectedEnd) : 'planned';
      const tempEntry: Awaited<ReturnType<typeof utils.entries.list.fetch>>[number] = {
        id: tempId,
        title: input.title,
        description: input.description ?? null,
        origin,
        start_time: origin === 'planned' ? selectedStart : null,
        end_time: origin === 'planned' ? selectedEnd : null,
        // 自動記録モデル: actual はユーザー編集時のみ。planned は NULL で作成される
        actual_start_time: origin === 'unplanned' ? selectedStart : null,
        actual_end_time: origin === 'unplanned' ? selectedEnd : null,
        planned_duration_minutes: null,
        fulfillment_score: null,
        deleted_at: null,
        skipped_at: null,
        user_id: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tag_id: input.tagId ?? null,
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
    onError: (error, input, context) => {
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
        // 衝突相手が自動記録だけなら「スキップして記録」のワンタップ解決を出す
        const skippableIds = findSkippableForInput(input);
        if (skippableIds.length > 0) {
          toast.error(t('entry.errors.timeOverlapAutoRecord'), {
            action: {
              label: t('entry.errors.skipAndRecord'),
              onClick: () => {
                void (async () => {
                  try {
                    for (const id of skippableIds) {
                      await skipEntry.mutateAsync({ id });
                    }
                    createEntry.mutate(input);
                  } catch {
                    // skip 失敗時は skipEntry.onError が toast 済み
                  }
                })();
              },
            },
          });
          return;
        }
        toast.error(t('entry.errors.timeOverlap'));
        return;
      }

      const errorMessage = error.message.includes('validation.')
        ? t(error.message as Parameters<typeof t>[0])
        : error.message;
      toast.error(t('entry.toast.createFailed', { error: errorMessage }));
    },
    onSettled: () => {
      void utils.entries.list.invalidate();
    },
  });
  return createEntry;
}
