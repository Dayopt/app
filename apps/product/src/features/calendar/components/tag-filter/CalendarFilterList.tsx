'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useCalendarFilterStore } from '@/features/calendar/stores/useCalendarFilterStore';
import { useShellStore } from '@/lib/stores/useShellStore';

import { useIsFetching } from '@tanstack/react-query';

import { SidebarSection } from '@/components/shell/sidebar';
import {
  flattenTagTree,
  TagDeleteStrategyDialog,
  tagKeys,
  useDeleteTag,
  useTagsHierarchy,
} from '@/features/tags';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { api } from '@/lib/trpc';
import { Button, HoverTooltip, Skeleton } from '@dayopt/components';

import { TagFlatList } from './components/TagFlatList';

/**
 * カレンダーフィルターリスト
 *
 * Googleカレンダーの「マイカレンダー」のようなUI
 * - タグ: 親子2階層でグルーピング表示
 * - チェックボックスで表示/非表示を切替
 * - `+` 押下で `useShellStore.openTagCreateModal()` で新規作成 modal を開く（PC=Dialog / モバイル=Drawer）
 */
export function CalendarFilterList() {
  const t = useTranslations();
  const isMobile = useIsMobile();
  const { data: nodes, isLoading: tagsLoading } = useTagsHierarchy();
  const { data: tagStats, isError: isTagStatsError } = api.statistics.getTagStats.useQuery();
  const tags = useMemo(() => flattenTagTree(nodes ?? []), [nodes]);

  // エラー時は null にすることで、削除確認ダイアログを常に表示（誤削除防止）
  const tagPlanCounts = useMemo(
    () => (isTagStatsError ? null : (tagStats?.counts ?? {})),
    [tagStats?.counts, isTagStatsError],
  );

  const deleteTagMutation = useDeleteTag();

  const openTagCreateModal = useShellStore.use.openTagCreateModal();

  // セレクタで必要な状態のみ購読
  const visibleTagIds = useCalendarFilterStore((s) => s.visibleTagIds);
  const toggleTag = useCalendarFilterStore((s) => s.toggleTag);
  const syncWithTags = useCalendarFilterStore((s) => s.syncWithTags);
  const showOnlyTag = useCalendarFilterStore((s) => s.showOnlyTag);
  const toggleGroupTags = useCalendarFilterStore((s) => s.toggleGroupTags);
  const showOnlyGroupTags = useCalendarFilterStore((s) => s.showOnlyGroupTags);
  const getGroupVisibility = useCalendarFilterStore((s) => s.getGroupVisibility);

  // hierarchy フェッチ中はフィルター初期化をスキップ（Race Condition防止）
  const isTagsFetching = useIsFetching({ queryKey: tagKeys.hierarchy() }) > 0;

  // タグ一覧と filter state を同期（新規は visible 追加、削除済みは orphan として除去）
  // フェッチ中は競合防止のためスキップ
  useEffect(() => {
    if (isTagsFetching) return;

    if (tags && tags.length > 0) {
      syncWithTags(tags.map((tag) => tag.id));
    }
  }, [tags, syncWithTags, isTagsFetching]);

  const isLoading = tagsLoading;

  // 削除確認ダイアログの状態
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    recordCount: number;
  } | null>(null);

  // 削除ハンドラー: stats未取得/エラー時は安全側に倒して常に確認ダイアログを表示
  const handleDeleteTag = useCallback(
    (tagId: string, tagName: string) => {
      const recordCount = tagPlanCounts === null ? 1 : (tagPlanCounts[tagId] ?? 0);
      if (recordCount === 0) {
        deleteTagMutation.mutate({ id: tagId });
      } else {
        setDeleteTarget({ id: tagId, name: tagName, recordCount });
      }
    },
    [tagPlanCounts, deleteTagMutation],
  );

  // 削除確認後のハンドラー（ストラテジー付き）
  const handleConfirmDelete = async (
    strategy: 'delete_blocks' | 'reassign',
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
          className="py-1"
          action={
            <HoverTooltip content={t('calendar.filter.createTag')} side="top">
              <Button
                variant="ghost"
                icon
                className="size-6"
                aria-label={t('calendar.filter.createTag')}
                onClick={() => openTagCreateModal()}
              >
                <Plus className="size-4" />
              </Button>
            </HoverTooltip>
          }
        >
          {isLoading ? (
            <div className="space-y-1 py-1">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : nodes && nodes.length > 0 ? (
            <TagFlatList
              nodes={nodes}
              allTags={tags}
              visibleTagIds={visibleTagIds}
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
        recordCount={deleteTarget?.recordCount ?? 0}
        availableTags={availableTagsForReassign}
      />
    </>
  );
}
