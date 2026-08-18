'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { Eye, EyeOff, MoreHorizontal } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { ConfirmDialog } from '@/components/ui/overlays/confirm-dialog';
import type { Tag } from '@/features/tags';
import { TagIcon, useMergeTag, useUpdateTag } from '@/features/tags';
import { cn, DropdownMenu, DropdownMenuTrigger, HoverTooltip } from '@dayopt/components';

import { useCalendarNavigation } from '../../../hooks/navigation/CalendarNavigationContext';
import { useTagModalNavigation } from '../../../hooks/useTagModalNavigation';
import { buildCalendarReviewPanelPath } from '../../../lib/panel-url';

import { ActivityRowMenu, type CategoryOption } from './ActivityRowMenu';
import { ActivityTimeblockCreatePopover } from './ActivityTimeblockCreatePopover';

interface ActivityRowProps {
  activity: Tag;
  /** 同名衝突の検出に使う全アクティビティ */
  allActivities: Tag[];
  /** カレンダーに表示中か */
  checked: boolean;
  /** 所属カテゴリー ID（null = 未分類） */
  categoryId: string | null;
  /** 継承する表示色。カテゴリーが持つ色で、未分類なら null */
  inheritedColor: string | null;
  /** 継承する表示アイコン。未分類なら null */
  inheritedIcon: string | null;
  categoryOptions: CategoryOption[];
  isMobile: boolean;
  onToggle: () => void;
  onArchiveActivity: () => void;
  onDeleteActivity: () => void;
  onShowOnlyActivity: () => void;
  openPopoverActivityId: string | null;
  onOpenPopover: (activityId: string | null) => void;
}

/**
 * サイドバーのアクティビティ行。
 *
 * 色・アイコンは所属カテゴリーから継承する（アクティビティ自身は持たない）。
 * カテゴリー未所属（未分類）のアクティビティは中立マーカーで表示する。
 * 行クリックでクイック作成ポップオーバー、👁 で表示切替、⋯ でメニュー。
 */
export function ActivityRow({
  activity,
  allActivities,
  checked,
  categoryId,
  inheritedColor,
  inheritedIcon,
  categoryOptions,
  isMobile,
  onToggle,
  onArchiveActivity,
  onDeleteActivity,
  onShowOnlyActivity,
  openPopoverActivityId,
  onOpenPopover,
}: ActivityRowProps) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const navigation = useCalendarNavigation();
  const updateMutation = useUpdateTag();
  const mergeMutation = useMergeTag();
  const { openTagMergeModal, openTagRenameModal } = useTagModalNavigation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [categoryChangeConflict, setCategoryChangeConflict] = useState<{
    targetActivityId: string;
    targetName: string;
  } | null>(null);

  const isPopoverOpen = openPopoverActivityId === activity.id;
  const isUncategorized = categoryId === null;

  const handleChangeCategory = useCallback(
    (newCategoryId: string | null) => {
      // 移動先に同名アクティビティがあると UNIQUE 制約に触れるため、統合を提案する
      const conflict = allActivities.find(
        (candidate) =>
          candidate.id !== activity.id &&
          (candidate.parent_id ?? null) === newCategoryId &&
          candidate.name.toLowerCase() === activity.name.toLowerCase(),
      );

      if (conflict) {
        setCategoryChangeConflict({ targetActivityId: conflict.id, targetName: conflict.name });
        return;
      }

      updateMutation.mutate({ id: activity.id, parentId: newCategoryId });
    },
    [allActivities, activity.id, activity.name, updateMutation],
  );

  const handleConfirmCategoryChangeMerge = useCallback(async () => {
    if (!categoryChangeConflict) return;
    try {
      await mergeMutation.mutateAsync({
        sourceTagId: activity.id,
        targetTagId: categoryChangeConflict.targetActivityId,
      });
    } finally {
      setCategoryChangeConflict(null);
    }
  }, [categoryChangeConflict, mergeMutation, activity.id]);

  const handleViewStats = useCallback(() => {
    if (navigation) {
      navigation.setPanelKind('review', { reviewTagId: activity.id });
      return;
    }
    // ここに来るのは navigation が無い経路だけなので、日付は現在時刻で解決する
    const reviewDate = new Date();
    router.push(buildCalendarReviewPanelPath(locale, reviewDate, activity.id));
  }, [navigation, router, locale, activity.id]);

  return (
    <>
      <div role="listitem">
        <div
          className={cn(
            'group/item relative flex cursor-pointer items-center rounded-lg text-sm',
            isMobile ? 'h-11' : 'h-8',
            'hover:bg-state-hover',
            (menuOpen || isPopoverOpen) && 'bg-state-selected',
          )}
          onClick={() => onOpenPopover(activity.id)}
        >
          <span className="ml-2 shrink-0">
            <TagIcon
              icon={inheritedIcon}
              color={inheritedColor}
              size="sm"
              isUncategorized={isUncategorized}
            />
          </span>

          <HoverTooltip
            content={activity.name}
            side="top"
            disabled={menuOpen}
            wrapperClassName="ml-2 min-w-0 flex-1"
          >
            <span className={cn('min-w-0 truncate', !checked && 'text-muted-foreground')}>
              {activity.name}
            </span>
          </HoverTooltip>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            aria-label={checked ? t('calendar.filter.hide') : t('calendar.filter.show')}
            className={cn(
              // eslint-disable-next-line tailwindcss/no-arbitrary-value -- 擬似要素のヒットエリア拡張に before:content-[''] の空文字指定が必須
              "text-muted-foreground hover:text-foreground hover:bg-state-hover focus-visible:ring-ring relative flex size-6 shrink-0 items-center justify-center rounded-lg transition-opacity before:absolute before:-inset-2 before:content-[''] focus-visible:ring-2 focus-visible:outline-none",
              checked
                ? 'opacity-0 group-focus-within/item:opacity-100 group-hover/item:opacity-100 focus-visible:opacity-100'
                : 'opacity-100',
              isMobile && 'opacity-100',
            )}
          >
            {checked ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
          </button>

          <div className="w-1 shrink-0" />

          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t('calendar.filter.activityMenu')}
                // eslint-disable-next-line tailwindcss/no-arbitrary-value -- 擬似要素の 44px ヒットエリアに空 content が必要
                className="text-muted-foreground hover:text-foreground hover:bg-state-hover focus-visible:ring-ring relative flex size-6 shrink-0 items-center justify-center rounded-lg opacity-0 transition-opacity group-focus-within/item:opacity-100 group-hover/item:opacity-100 after:absolute after:inset-0 after:m-auto after:size-11 after:content-[''] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none [@media(hover:none)]:opacity-100"
                onClick={(event) => event.stopPropagation()}
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <ActivityRowMenu
              currentCategoryId={categoryId}
              categoryOptions={categoryOptions}
              isMobile={isMobile}
              onOpenRenameDialog={() =>
                openTagRenameModal({
                  id: activity.id,
                  name: activity.name,
                  parent_id: activity.parent_id ?? null,
                })
              }
              onChangeCategory={handleChangeCategory}
              onOpenMergeModal={() =>
                openTagMergeModal({
                  id: activity.id,
                  name: activity.name,
                  color: activity.color ?? null,
                })
              }
              onShowOnlyActivity={onShowOnlyActivity}
              onViewStats={handleViewStats}
              onArchiveActivity={onArchiveActivity}
              onDeleteActivity={onDeleteActivity}
            />
          </DropdownMenu>

          {isPopoverOpen ? (
            <ActivityTimeblockCreatePopover
              open
              onOpenChange={(nextOpen) => onOpenPopover(nextOpen ? activity.id : null)}
              activity={{
                id: activity.id,
                name: activity.name,
                color: inheritedColor,
                icon: inheritedIcon,
              }}
              isMobile={isMobile}
            />
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={categoryChangeConflict !== null}
        onClose={() => setCategoryChangeConflict(null)}
        onConfirm={handleConfirmCategoryChangeMerge}
        title={t('calendar.filter.mergeActivity.title')}
        description={
          categoryChangeConflict
            ? t('calendar.filter.mergeActivity.description', {
                sourceName: activity.name,
                targetName: categoryChangeConflict.targetName,
              })
            : ''
        }
        confirmLabel={t('calendar.filter.mergeActivity.confirm')}
        variant="destructive"
      />
    </>
  );
}
