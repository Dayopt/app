'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useCalendarFilterStore } from '@/features/calendar/stores/useCalendarFilterStore';

import { SidebarSection } from '@/components/shell/sidebar';
import type { ActivityTree } from '@/features/activities';
import {
  ActivityDeleteConfirmDialog,
  collectActivitiesFromTree,
  collectActivityIdsFromTree,
  useActivityTree,
  useArchiveActivity,
  useArchiveCategory,
  useArchivedActivities,
  useDeleteActivity,
  useDeleteCategory,
} from '@/features/activities';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { api } from '@/lib/trpc';
import { Button, HoverTooltip, Skeleton } from '@dayopt/components';

import { useActivityModalNavigation } from '../../hooks/useActivityModalNavigation';

import { mergeActivityDeleteCounts } from './activity-delete-counts';
import { ActivityRow } from './components/ActivityRow';
import type { CategoryOption } from './components/ActivityRowMenu';
import { ArchivedActivityList } from './components/ArchivedActivityList';
import { CategoryGroup } from './components/CategoryGroup';

const EMPTY_CATEGORIES: ActivityTree['categories'] = [];
const EMPTY_ACTIVITIES: ActivityTree['uncategorized'] = [];

/**
 * サイドバーのアクティビティ一覧。
 *
 * IA（確定仕様）:
 * 1. カテゴリー見出し（色 + アイコン + 折りたたみ、既定は展開）→ 所属アクティビティをネスト
 * 2. 「未分類」見出し → カテゴリー未所属のアクティビティをテキストのみで列挙
 * 3. 「アーカイブ済み」折りたたみ
 *
 * アクティビティ未設定のブロックのフィルタ行は置かない（2026-08-18 User 指示）。
 * それらのブロックは常に表示される。
 *
 * 並び順はサーバーの `listTree` が名前順で返す（`sort_order` は持たない）。
 * DnD は廃止した。カテゴリーの付け替えは行メニューの「カテゴリーを変更」で行う。
 */
export function ActivityFilterList() {
  const t = useTranslations();
  const isMobile = useIsMobile();
  const { data: tree, isLoading, isFetching } = useActivityTree();
  const { data: stats, isError: isStatsError } = api.statistics.getActivityStats.useQuery();
  const { data: archivedActivities } = useArchivedActivities();

  // `?? []` を直接書くと毎 render で新しい配列になり、下流の useMemo /
  // useCallback の依存が毎回変わる。空配列を定数に固定して安定させる
  const categories = useMemo(() => tree?.categories ?? EMPTY_CATEGORIES, [tree]);
  const uncategorized = tree?.uncategorized ?? EMPTY_ACTIVITIES;

  const categoryOptions = useMemo<CategoryOption[]>(
    () =>
      categories.map(({ category }) => ({
        id: category.id,
        name: category.name,
        color: category.color,
        icon: category.icon,
      })),
    [categories],
  );

  /** 「カテゴリーを変更」ピッカーと同名衝突の検出に使う全アクティビティ */
  const allActivities = useMemo(() => collectActivitiesFromTree(tree), [tree]);

  // 削除判定・確認ダイアログ用: records + plans の合計件数。
  // エラー時は null にして削除確認ダイアログを常に表示する（誤削除防止）。
  const deleteCounts = useMemo(
    () => mergeActivityDeleteCounts(stats, isStatsError),
    [stats, isStatsError],
  );

  const deleteActivityMutation = useDeleteActivity();
  const deleteCategoryMutation = useDeleteCategory();
  const archiveActivityMutation = useArchiveActivity();
  const archiveCategoryMutation = useArchiveCategory();
  const { openActivityCreateModal } = useActivityModalNavigation();

  const visibleActivityIds = useCalendarFilterStore((s) => s.visibleActivityIds);
  const toggleActivity = useCalendarFilterStore((s) => s.toggleActivity);
  const syncWithActivities = useCalendarFilterStore((s) => s.syncWithActivities);
  const showOnlyActivity = useCalendarFilterStore((s) => s.showOnlyActivity);
  const showOnlyCategoryActivities = useCalendarFilterStore((s) => s.showOnlyCategoryActivities);
  const getCategoryVisibility = useCalendarFilterStore((s) => s.getCategoryVisibility);

  // 一覧と filter state を同期（新規は visible 追加、削除済みは orphan として除去）。
  //
  // アーカイブ済み ID も含める。含めないと、アーカイブ済みアクティビティを参照する
  // 過去ブロックが orphan 扱いで visibleActivityIds から消え、カレンダーから見えなくなる
  // （#1576 の回帰）。フェッチ中はスキップして、途中の集合で orphan 除去が走るのを防ぐ。
  //
  // `useCalendarData` も同じ store を sync するので、**渡す ID 集合を揃える**こと。
  // ズレると後から走った方が相手の ID を orphan として消す。
  const allFilterableIds = useMemo(
    () => [
      ...collectActivityIdsFromTree(tree),
      ...(archivedActivities ?? []).map((activity) => activity.id),
    ],
    [tree, archivedActivities],
  );

  useEffect(() => {
    if (isFetching) return;
    if (allFilterableIds.length === 0) return;
    syncWithActivities(allFilterableIds);
  }, [allFilterableIds, syncWithActivities, isFetching]);

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
    kind: 'activity' | 'category';
    id: string;
    name: string;
    affectedCount: number;
  } | null>(null);

  // 未使用（Plan / Record 合計 0 件）は即削除、使用済みは「アクティビティなしになる」
  // 説明つきの確認を挟む。stats 未取得 / エラー時は安全側に倒して常に確認する
  const handleDeleteActivity = useCallback(
    (id: string, name: string) => {
      const affectedCount = deleteCounts === null ? 1 : (deleteCounts[id] ?? 0);
      if (affectedCount === 0) {
        deleteActivityMutation.mutate({ id });
        return;
      }
      setDeleteTarget({ kind: 'activity', id, name, affectedCount });
    },
    [deleteCounts, deleteActivityMutation],
  );

  // カテゴリー削除は予定・記録に触れない。影響するのは所属アクティビティが
  // 未分類へ移ることだけなので、件数は tree から数える（stats は使わない）
  const handleDeleteCategory = useCallback(
    (id: string, name: string) => {
      const memberCount =
        categories.find((node) => node.category.id === id)?.activities.length ?? 0;
      if (memberCount === 0) {
        deleteCategoryMutation.mutate({ id });
        return;
      }
      setDeleteTarget({ kind: 'category', id, name, affectedCount: memberCount });
    },
    [categories, deleteCategoryMutation],
  );

  const handleArchiveActivity = useCallback(
    (id: string) => {
      archiveActivityMutation.mutate({ id });
    },
    [archiveActivityMutation],
  );

  const handleArchiveCategory = useCallback(
    (id: string) => {
      archiveCategoryMutation.mutate({ id });
    },
    [archiveCategoryMutation],
  );

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === 'category') {
        await deleteCategoryMutation.mutateAsync({ id: deleteTarget.id });
      } else {
        await deleteActivityMutation.mutateAsync({ id: deleteTarget.id });
      }
    } finally {
      setDeleteTarget(null);
    }
  };

  const hasAnyActivity = categories.length > 0 || uncategorized.length > 0;

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
            {categories.length > 0 ? (
              <div className="space-y-1">
                {categories.map(({ category, activities }) => (
                  <CategoryGroup
                    key={category.id}
                    category={category}
                    activities={activities}
                    allActivities={allActivities}
                    visibleActivityIds={visibleActivityIds}
                    categoryOptions={categoryOptions}
                    collapsed={collapsedCategories.has(category.id)}
                    isMobile={isMobile}
                    onToggleCollapse={() => toggleCategoryCollapse(category.id)}
                    onToggleActivity={toggleActivity}
                    onShowOnlyActivity={showOnlyActivity}
                    onShowOnlyCategoryActivities={showOnlyCategoryActivities}
                    getCategoryVisibility={getCategoryVisibility}
                    onArchiveCategory={handleArchiveCategory}
                    onDeleteCategory={handleDeleteCategory}
                    onArchiveActivity={handleArchiveActivity}
                    onDeleteActivity={handleDeleteActivity}
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
                {uncategorized.map((activity) => (
                  <ActivityRow
                    key={activity.id}
                    activity={activity}
                    allActivities={allActivities}
                    checked={visibleActivityIds.has(activity.id)}
                    categoryId={null}
                    inheritedColor={null}
                    inheritedIcon={null}
                    categoryOptions={categoryOptions}
                    isMobile={isMobile}
                    onToggle={() => toggleActivity(activity.id)}
                    onArchiveActivity={() => handleArchiveActivity(activity.id)}
                    onDeleteActivity={() => handleDeleteActivity(activity.id, activity.name)}
                    onShowOnlyActivity={() => showOnlyActivity(activity.id)}
                    openPopoverActivityId={openPopoverActivityId}
                    onOpenPopover={setOpenPopoverActivityId}
                  />
                ))}
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
        <ArchivedActivityList
          onDeleteActivity={handleDeleteActivity}
          onDeleteCategory={handleDeleteCategory}
        />
      </div>

      {/* 完全削除の確認ダイアログ（関連 Plan / Record はアクティビティなしになる） */}
      <ActivityDeleteConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        kind={deleteTarget?.kind ?? 'activity'}
        name={deleteTarget?.name ?? ''}
        affectedCount={deleteTarget?.affectedCount ?? 0}
      />
    </>
  );
}
