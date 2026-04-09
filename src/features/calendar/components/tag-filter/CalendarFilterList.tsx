'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useTranslations } from 'next-intl';

import { useCalendarFilterStore } from '@/stores/useCalendarFilterStore';

import { Skeleton } from '@/components/ui/skeleton';

import { useIsFetching } from '@tanstack/react-query';

import { TagDeleteStrategyDialog, tagKeys, useDeleteTag, useTags } from '@/features/tags';
import { useIsMobile } from '@/hooks/useIsMobile';
import { api } from '@/platform/trpc';
import { SidebarSection } from '@/shell/components/sidebar';
import { useTagModalNavigation } from '../../hooks/useTagModalNavigation';

import { CreateTagButton } from './components/CreateTagButton';
import { TagFlatList } from './components/TagFlatList';

/**
 * カレンダーフィルターリスト
 *
 * Googleカレンダーの「マイカレンダー」のようなUI
 * - タグ: コロン記法プレフィックスでグルーピング表示
 * - チェックボックスで表示/非表示を切替
 */
export function CalendarFilterList() {
  const t = useTranslations();
  const isMobile = useIsMobile();
  const { data: tags, isLoading: tagsLoading } = useTags();
  const { data: tagStats, isError: isTagStatsError } = api.entries.getTagStats.useQuery();

  // エラー時は null にすることで、削除確認ダイアログを常に表示（誤削除防止）
  const tagPlanCounts = useMemo(
    () => (isTagStatsError ? null : (tagStats?.counts ?? {})),
    [tagStats?.counts, isTagStatsError],
  );

  const deleteTagMutation = useDeleteTag();

  // セレクタで必要な状態のみ購読
  const visibleTagIds = useCalendarFilterStore((s) => s.visibleTagIds);
  const toggleTag = useCalendarFilterStore((s) => s.toggleTag);
  const initializeWithTags = useCalendarFilterStore((s) => s.initializeWithTags);
  const showOnlyTag = useCalendarFilterStore((s) => s.showOnlyTag);
  const toggleGroupTags = useCalendarFilterStore((s) => s.toggleGroupTags);
  const showOnlyGroupTags = useCalendarFilterStore((s) => s.showOnlyGroupTags);
  const getGroupVisibility = useCalendarFilterStore((s) => s.getGroupVisibility);

  // tags.list フェッチ中はフィルター初期化をスキップ（Race Condition防止）
  const isTagsFetching = useIsFetching({ queryKey: tagKeys.list() }) > 0;

  // タグ一覧取得後に初期化（フェッチ中は競合防止のためスキップ）
  useEffect(() => {
    if (isTagsFetching) return;

    if (tags && tags.length > 0) {
      initializeWithTags(tags.map((tag) => tag.id));
    }
  }, [tags, initializeWithTags, isTagsFetching]);

  const isLoading = tagsLoading;

  // タグモーダルナビゲーション
  const { openTagCreateModal: _openTagCreateModal } = useTagModalNavigation();

  // 削除確認ダイアログの状態
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    entryCount: number;
  } | null>(null);

  // 削除ハンドラー: stats未取得/エラー時は安全側に倒して常に確認ダイアログを表示
  const handleDeleteTag = useCallback(
    (tagId: string, tagName: string) => {
      const entryCount = tagPlanCounts === null ? 1 : (tagPlanCounts[tagId] ?? 0);
      if (entryCount === 0) {
        deleteTagMutation.mutate({ id: tagId });
      } else {
        setDeleteTarget({ id: tagId, name: tagName, entryCount });
      }
    },
    [tagPlanCounts, deleteTagMutation],
  );

  // 削除確認後のハンドラー（ストラテジー付き）
  const handleConfirmDelete = async (
    strategy: 'delete_entries' | 'reassign',
    targetTagId?: string,
  ) => {
    if (!deleteTarget) return;
    try {
      await deleteTagMutation.mutateAsync({
        id: deleteTarget.id,
        strategy,
        targetTagId,
      });
    } finally {
      setDeleteTarget(null);
    }
  };

  // ダイアログに渡す付け替え先タグ一覧（削除対象を除外）
  const availableTagsForReassign = useMemo(
    () => (tags ?? []).filter((tag) => tag.id !== deleteTarget?.id),
    [tags, deleteTarget?.id],
  );

  return (
    <>
      <div className="w-full min-w-0 space-y-2 overflow-hidden">
        {/* タグ */}
        <SidebarSection
          title={t('calendar.filter.tags')}
          defaultOpen
          className="py-1"
          action={<CreateTagButton />}
        >
          {isLoading ? (
            <div className="space-y-1 py-1">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : tags && tags.length > 0 ? (
            <TagFlatList
              tags={tags}
              visibleTagIds={visibleTagIds}
              tagCounts={tagPlanCounts ?? {}}
              onToggleTag={toggleTag}
              onDeleteTag={handleDeleteTag}
              onShowOnlyTag={showOnlyTag}
              onToggleGroupTags={toggleGroupTags}
              onShowOnlyGroupTags={showOnlyGroupTags}
              getGroupVisibility={getGroupVisibility}
              isMobile={isMobile}
            />
          ) : (
            <div className="text-muted-foreground px-2 py-2 text-xs">
              {t('calendar.filter.noTags')}
            </div>
          )}
        </SidebarSection>
      </div>

      {/* タグ削除ストラテジーダイアログ */}
      <TagDeleteStrategyDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        tagName={deleteTarget?.name ?? ''}
        entryCount={deleteTarget?.entryCount ?? 0}
        availableTags={availableTagsForReassign}
      />
    </>
  );
}
