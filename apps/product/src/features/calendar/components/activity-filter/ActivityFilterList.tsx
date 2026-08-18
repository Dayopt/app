'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useCalendarFilterStore } from '@/features/calendar/stores/useCalendarFilterStore';
import { useShellStore } from '@/lib/stores/useShellStore';

import { useIsFetching } from '@tanstack/react-query';

import { SidebarSection } from '@/components/shell/sidebar';
import {
  TagDeleteConfirmDialog,
  tagKeys,
  useArchivedTags,
  useArchiveTag,
  useDeleteTag,
  useTagsHierarchy,
} from '@/features/tags';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { api } from '@/lib/trpc';
import { Button, HoverTooltip, Skeleton } from '@dayopt/components';

import { mergeActivityDeleteCounts } from './activity-delete-counts';
import { partitionActivityTree } from './activity-tree';
import { ActivityRow } from './components/ActivityRow';
import type { CategoryOption } from './components/ActivityRowMenu';
import { ArchivedActivityList } from './components/ArchivedActivityList';
import { CategoryGroup } from './components/CategoryGroup';
import { NoActivityRow } from './components/NoActivityRow';

/**
 * サイドバーのアクティビティ一覧。
 *
 * IA（確定仕様）:
 * 1. カテゴリー見出し（色 + アイコン + 折りたたみ、既定は展開）→ 所属アクティビティをネスト
 * 2. 「未分類」見出し → カテゴリー未所属のアクティビティをフラットに列挙
 * 3. 「アクティビティなし」行 → アクティビティ未設定のブロックの表示切替
 * 4. 「アーカイブ済み」折りたたみ
 *
 * DnD は廃止した。カテゴリーの付け替えは行メニューの「カテゴリーを変更」で行う。
 */
export function ActivityFilterList() {
  const t = useTranslations();
  const isMobile = useIsMobile();
  const { data: nodes, isLoading } = useTagsHierarchy();
  const { data: stats, isError: isStatsError } = api.statistics.getTagStats.useQuery();
  const { data: archived } = useArchivedTags();

  const model = useMemo(() => partitionActivityTree(nodes ?? []), [nodes]);

  const categoryOptions = useMemo<CategoryOption[]>(
    () =>
      model.categories.map(({ category }) => ({
        id: category.id,
        name: category.name,
        color: category.color,
        icon: category.icon,
      })),
    [model.categories],
  );

  // 削除判定・確認ダイアログ用: records + plans の合計件数。
  // エラー時は null にして削除確認ダイアログを常に表示する（誤削除防止）。
  const deleteCounts = useMemo(
    () => mergeActivityDeleteCounts(stats, isStatsError),
    [stats, isStatsError],
  );

  const deleteMutation = useDeleteTag();
  const archiveMutation = useArchiveTag();
  const openActivityCreateModal = useShellStore.use.openTagCreateModal();

  const visibleActivityIds = useCalendarFilterStore((s) => s.visibleActivityIds);
  const toggleActivity = useCalendarFilterStore((s) => s.toggleActivity);
  const syncWithActivities = useCalendarFilterStore((s) => s.syncWithActivities);
  const showOnlyActivity = useCalendarFilterStore((s) => s.showOnlyActivity);
  const showOnlyCategoryActivities = useCalendarFilterStore((s) => s.showOnlyCategoryActivities);
  const getCategoryVisibility = useCalendarFilterStore((s) => s.getCategoryVisibility);
  const showNoActivity = useCalendarFilterStore((s) => s.showNoActivity);
  const toggleShowNoActivity = useCalendarFilterStore((s) => s.toggleShowNoActivity);
  const showOnlyNoActivity = useCalendarFilterStore((s) => s.showOnlyNoActivity);

  // hierarchy フェッチ中はフィルター初期化をスキップ（Race Condition 防止）
  const isFetching = useIsFetching({ queryKey: tagKeys.hierarchy() }) > 0;

  // 一覧と filter state を同期（新規は visible 追加、削除済みは orphan として除去）。
  // アーカイブ済み ID も含めないと、archived を参照する過去ブロックが orphan 扱いされ
  // visibleActivityIds から消えてカレンダーから消えてしまう（#1576 の回帰）。
  useEffect(() => {
    if (isFetching) return;

    const allIds = [...model.allActivityIds, ...(archived ?? []).map((item) => item.id)];
    if (allIds.length > 0) {
      syncWithActivities(allIds);
    }
  }, [model.allActivityIds, archived, syncWithActivities, isFetching]);

  // 既定は展開。折りたたんだカテゴリーだけを集合で持つ
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [openPopoverActivityId, setOpenPopoverActivityId] = useState<string | null>(null);

  const toggleCategoryCollapse = useCallback((categoryId: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }, []);

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    recordCount: number;
  } | null>(null);

  // 未使用（Plan/Record 合計 0 件）は即削除、使用済みは未分類化の説明つき確認を挟む。
  // stats 未取得/エラー時は安全側に倒して常に確認ダイアログを表示する
  const handleDelete = useCallback(
    (id: string, name: string) => {
      const affectedCount = deleteCounts === null ? 1 : (deleteCounts[id] ?? 0);
      if (affectedCount === 0) {
        deleteMutation.mutate({ id });
      } else {
        setDeleteTarget({ id, name, recordCount: affectedCount });
      }
    },
    [deleteCounts, deleteMutation],
  );

  const handleArchive = useCallback(
    (id: string) => {
      archiveMutation.mutate({ id });
    },
    [archiveMutation],
  );

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync({ id: deleteTarget.id });
    } finally {
      setDeleteTarget(null);
    }
  };

  const hasAnyActivity = model.categories.length > 0 || model.uncategorizedActivities.length > 0;

  return (
    <>
      <div className="w-full min-w-0 space-y-2 overflow-hidden">
        {isLoading ? (
          <div className="space-y-1 py-1">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <>
            {/* カテゴリー群 */}
            {model.categories.length > 0 ? (
              <div className="space-y-1">
                {model.categories.map(({ category, activities }) => (
                  <CategoryGroup
                    key={category.id}
                    category={category}
                    activities={activities}
                    allActivities={model.allActivities}
                    visibleActivityIds={visibleActivityIds}
                    categoryOptions={categoryOptions}
                    collapsed={collapsedCategories.has(category.id)}
                    isMobile={isMobile}
                    onToggleCollapse={() => toggleCategoryCollapse(category.id)}
                    onToggleActivity={toggleActivity}
                    onShowOnlyActivity={showOnlyActivity}
                    onShowOnlyCategoryActivities={showOnlyCategoryActivities}
                    getCategoryVisibility={getCategoryVisibility}
                    onArchive={handleArchive}
                    onDelete={handleDelete}
                    openPopoverActivityId={openPopoverActivityId}
                    onOpenPopover={setOpenPopoverActivityId}
                  />
                ))}
              </div>
            ) : null}

            {/* 未分類（カテゴリー未所属のアクティビティ） + アクティビティなし行 */}
            <SidebarSection
              title={t('calendar.filter.uncategorized')}
              className="py-1"
              action={
                <HoverTooltip content={t('calendar.filter.createActivity')} side="top">
                  <Button
                    variant="ghost"
                    icon
                    className="size-6"
                    aria-label={t('calendar.filter.createActivity')}
                    onClick={() => openActivityCreateModal()}
                  >
                    <Plus className="size-4" />
                  </Button>
                </HoverTooltip>
              }
            >
              <div role="list" className="space-y-1">
                {model.uncategorizedActivities.map((activity) => (
                  <ActivityRow
                    key={activity.id}
                    activity={activity}
                    allActivities={model.allActivities}
                    checked={visibleActivityIds.has(activity.id)}
                    categoryId={null}
                    inheritedColor={null}
                    inheritedIcon={null}
                    categoryOptions={categoryOptions}
                    isMobile={isMobile}
                    onToggle={() => toggleActivity(activity.id)}
                    onArchiveActivity={() => handleArchive(activity.id)}
                    onDeleteActivity={() => handleDelete(activity.id, activity.name)}
                    onShowOnlyActivity={() => showOnlyActivity(activity.id)}
                    openPopoverActivityId={openPopoverActivityId}
                    onOpenPopover={setOpenPopoverActivityId}
                  />
                ))}

                {/* アクティビティ未設定のブロックの表示切替。
                    見出しの「未分類」とは別概念なので語彙を混ぜない */}
                <NoActivityRow
                  checked={showNoActivity}
                  isMobile={isMobile}
                  onToggle={toggleShowNoActivity}
                  onShowOnlyThis={showOnlyNoActivity}
                />
              </div>
            </SidebarSection>

            {!hasAnyActivity ? (
              <div className="text-muted-foreground px-2 py-2 text-xs">
                {t('calendar.filter.noActivities')}
              </div>
            ) : null}
          </>
        )}

        {/* アーカイブ済み（参照・復元・完全削除の入口） */}
        <ArchivedActivityList onDelete={handleDelete} />
      </div>

      {/* 完全削除の確認ダイアログ（関連 Plan / Record はアクティビティなしになる） */}
      <TagDeleteConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        tagName={deleteTarget?.name ?? ''}
        recordCount={deleteTarget?.recordCount ?? 0}
      />
    </>
  );
}
