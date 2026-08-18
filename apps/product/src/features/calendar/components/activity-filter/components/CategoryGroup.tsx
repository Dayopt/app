'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import { useLocale } from 'next-intl';

import type { Tag } from '@/features/tags';

import { useCalendarNavigation } from '../../../hooks/navigation/CalendarNavigationContext';
import { useTagModalNavigation } from '../../../hooks/useTagModalNavigation';
import { buildCalendarReviewPanelPath } from '../../../lib/panel-url';

import { ActivityRow } from './ActivityRow';
import type { CategoryOption } from './ActivityRowMenu';
import { CategoryHeader } from './CategoryHeader';
import { useCategoryAppearanceEdit } from './useCategoryAppearanceEdit';

interface CategoryGroupProps {
  category: Tag;
  activities: Tag[];
  allActivities: Tag[];
  visibleActivityIds: Set<string>;
  categoryOptions: CategoryOption[];
  collapsed: boolean;
  isMobile: boolean;
  onToggleCollapse: () => void;
  onToggleActivity: (activityId: string) => void;
  onShowOnlyActivity: (activityId: string) => void;
  onShowOnlyCategoryActivities: (activityIds: string[]) => void;
  getCategoryVisibility: (activityIds: string[]) => 'all' | 'none' | 'some';
  onArchive: (id: string) => void;
  onDelete: (id: string, name: string) => void;
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
  onArchive,
  onDelete,
  openPopoverActivityId,
  onOpenPopover,
}: CategoryGroupProps) {
  const locale = useLocale();
  const router = useRouter();
  const navigation = useCalendarNavigation();
  const { openTagRenameModal, openTagCreateModal } = useTagModalNavigation();
  const { displayColor, handleColorChange, handleIconChange } = useCategoryAppearanceEdit({
    categoryId: category.id,
    initialColor: category.color ?? undefined,
  });

  const activityIds = useMemo(() => activities.map((activity) => activity.id), [activities]);
  const visibility = getCategoryVisibility(activityIds);

  const handleViewStats = useCallback(() => {
    if (navigation) {
      navigation.setPanelKind('review', { reviewTagId: category.id });
      return;
    }
    // ここに来るのは navigation が無い経路だけなので、日付は現在時刻で解決する
    const reviewDate = new Date();
    router.push(buildCalendarReviewPanelPath(locale, reviewDate, category.id));
  }, [navigation, router, locale, category.id]);

  return (
    <div className="w-full min-w-0">
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
        onAddActivityToCategory={() => openTagCreateModal({ initialParentId: category.id })}
        onRenameCategory={() =>
          openTagRenameModal({
            id: category.id,
            name: category.name,
            parent_id: category.parent_id ?? null,
          })
        }
        onViewStats={handleViewStats}
        onArchiveCategory={() => onArchive(category.id)}
        onDeleteCategory={() => onDelete(category.id, category.name)}
      />

      {!collapsed ? (
        <div role="list" className="ml-4 space-y-1">
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
              onArchiveActivity={() => onArchive(activity.id)}
              onDeleteActivity={() => onDelete(activity.id, activity.name)}
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
