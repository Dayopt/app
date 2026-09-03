'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import { useLocale } from 'next-intl';

import type { Activity, Category } from '@/features/activities';

import { useActivityModalNavigation } from '../../../hooks/useActivityModalNavigation';
import { buildReportPath } from '../../../lib/panel-url';

import { ActivityRow } from './ActivityRow';
import type { CategoryOption } from './ActivityRowMenu';
import { CategoryHeader } from './CategoryHeader';
import { useCategoryAppearanceEdit } from './useCategoryAppearanceEdit';

interface CategoryGroupProps {
  category: Category;
  activities: Activity[];
  allActivities: Activity[];
  visibleActivityIds: Set<string>;
  categoryOptions: CategoryOption[];
  collapsed: boolean;
  isMobile: boolean;
  onToggleCollapse: () => void;
  onToggleActivity: (activityId: string) => void;
  onShowOnlyActivity: (activityId: string) => void;
  onShowOnlyCategoryActivities: (activityIds: string[]) => void;
  getCategoryVisibility: (activityIds: string[]) => 'all' | 'none' | 'some';
  onArchiveCategory: (id: string) => void;
  onDeleteCategory: (id: string, name: string) => void;
  onArchiveActivity: (id: string) => void;
  onDeleteActivity: (id: string, name: string) => void;
  openPopoverActivityId: string | null;
  onOpenPopover: (activityId: string | null) => void;
}

/**
 * カテゴリー見出し + そこに所属するアクティビティのネスト表示。
 *
 * 見出しにチェックボックスは置かず、一括表示はメニューの
 * 「このカテゴリーだけ表示」で行う（確定仕様）。所属アクティビティは
 * カテゴリーの色とアイコンを継承する。
 */
export function CategoryGroup({
  category,
  activities,
  allActivities,
  visibleActivityIds,
  categoryOptions,
  collapsed,
  isMobile,
  onToggleCollapse,
  onToggleActivity,
  onShowOnlyActivity,
  onShowOnlyCategoryActivities,
  getCategoryVisibility,
  onArchiveCategory,
  onDeleteCategory,
  onArchiveActivity,
  onDeleteActivity,
  openPopoverActivityId,
  onOpenPopover,
}: CategoryGroupProps) {
  const locale = useLocale();
  const router = useRouter();
  const { openActivityCreateModal, openCategoryRenameModal } = useActivityModalNavigation();
  const { displayColor, handleColorChange, handleIconChange } = useCategoryAppearanceEdit({
    categoryId: category.id,
    initialColor: category.color ?? undefined,
  });

  const activityIds = useMemo(() => activities.map((activity) => activity.id), [activities]);
  const visibility = getCategoryVisibility(activityIds);

  const handleViewStats = useCallback(() => {
    // カレンダー内パネル（CalendarReviewRail）は廃止済み（#2181 Step 4）。
    // tagId によるセグメント絞り込みは Step 5（セグメント配線）で復元する。
    router.push(buildReportPath(locale, new Date()));
  }, [router, locale]);

  return (
    // カテゴリー間は展開・折りたたみを問わず親の space-y-2（8px）だけ。
    // グループ内は 4px（見出し→1行目、行→行）なので 2 倍あれば境目は読める
    // （2026-09-03 User 判断。一度 16px / 12px を試して広すぎた）。
    <div className="w-full min-w-0 rounded-lg">
      <CategoryHeader
        label={category.name}
        visibility={visibility}
        collapsed={collapsed}
        displayColor={displayColor}
        currentIcon={category.icon}
        isMobile={isMobile}
        onToggleCollapse={onToggleCollapse}
        onShowOnlyCategory={() => onShowOnlyCategoryActivities(activityIds)}
        onColorChange={handleColorChange}
        onIconChange={handleIconChange}
        onAddActivityToCategory={() => openActivityCreateModal({ initialCategoryId: category.id })}
        onRenameCategory={() => openCategoryRenameModal({ id: category.id, name: category.name })}
        onViewStats={handleViewStats}
        onArchiveCategory={() => onArchiveCategory(category.id)}
        onDeleteCategory={() => onDeleteCategory(category.id, category.name)}
      />

      {/* ml-6: 見出しのアイコン + テキストぶんの字下げ（実測 32px）に子行のテキストを
          揃える。子行はアイコンを持たず、自身の ml-2 だけを引いた分をここで足す */}
      {!collapsed ? (
        <div role="list" className="mt-1 ml-6 space-y-1">
          {activities.map((activity) => (
            <ActivityRow
              key={activity.id}
              activity={activity}
              allActivities={allActivities}
              checked={visibleActivityIds.has(activity.id)}
              categoryId={category.id}
              inheritedColor={displayColor}
              inheritedIcon={category.icon ?? null}
              categoryOptions={categoryOptions.filter((option) => option.id !== category.id)}
              isMobile={isMobile}
              onToggle={() => onToggleActivity(activity.id)}
              onArchiveActivity={() => onArchiveActivity(activity.id)}
              onDeleteActivity={() => onDeleteActivity(activity.id, activity.name)}
              onShowOnlyActivity={() => onShowOnlyActivity(activity.id)}
              openPopoverActivityId={openPopoverActivityId}
              onOpenPopover={onOpenPopover}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
