'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { Eye, EyeOff, MoreHorizontal } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import type { Activity } from '@/features/activities';
import { useUpdateActivity } from '@/features/activities';
import { toast } from '@/lib/toast';
import { cn, DropdownMenu, DropdownMenuTrigger, HoverTooltip } from '@dayopt/components';

import { useActivityModalNavigation } from '../../../hooks/useActivityModalNavigation';
import { buildReportPath } from '../../../lib/panel-url';

import { ActivityRowMenu, type CategoryOption } from './ActivityRowMenu';
import { ActivityTimeblockCreatePopover } from './ActivityTimeblockCreatePopover';

interface ActivityRowProps {
  activity: Activity;
  /** 同名衝突の検出に使う全アクティビティ */
  allActivities: Activity[];
  /** カレンダーに表示中か */
  checked: boolean;
  /** 所属カテゴリー ID（null = 未分類） */
  categoryId: string | null;
  /**
   * クイック作成ポップオーバーへ渡す継承色。行そのものには出さないが、
   * ポップオーバーはカテゴリーの色でブロックの見た目を示すため必要。
   */
  inheritedColor: string | null;
  /** 同上（ポップオーバー用） */
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
 * 行はテキストのみで、アイコンも色ドットも出さない。色とアイコンを持つのは
 * カテゴリーだけで、配下の行に並べても見出しの繰り返しになるため。
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
  const updateMutation = useUpdateActivity();
  const { openActivityRenameModal } = useActivityModalNavigation();

  const [menuOpen, setMenuOpen] = useState(false);

  const isPopoverOpen = openPopoverActivityId === activity.id;

  const handleChangeCategory = useCallback(
    (newCategoryId: string | null) => {
      // 移動先に同名アクティビティがあると UNIQUE 制約に触れる。統合（マージ）は
      // v1 で持たない（#2162 §4-8）ので、ここでは送らずに理由を伝えるだけにする。
      // サーバー側も DUPLICATE_NAME で弾くが、先に出した方が往復が 1 回減る。
      const hasConflict = allActivities.some(
        (candidate) =>
          candidate.id !== activity.id &&
          (candidate.category_id ?? null) === newCategoryId &&
          candidate.name.toLowerCase() === activity.name.toLowerCase(),
      );

      if (hasConflict) {
        toast.error(t('calendar.filter.createDialog.duplicateName'));
        return;
      }

      updateMutation.mutate({ id: activity.id, categoryId: newCategoryId });
    },
    [allActivities, activity.id, activity.name, updateMutation, t],
  );

  const handleViewStats = useCallback(() => {
    // カレンダー内パネル（CalendarReviewRail）は廃止済み（#2181 Step 4）。
    // tagId によるセグメント絞り込みは Step 5（セグメント配線）で復元する。
    router.push(buildReportPath(locale, new Date()));
  }, [router, locale]);

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
          {/* アクティビティ行にアイコンは出さない（2026-08-18 User 指示）。
              カテゴリー配下では見出しのアイコンをそのまま繰り返すことになり、
              未分類では継承する色が無い。どちらも情報を足さずノイズになる。
              色とアイコンを見せるのはカテゴリー見出しだけ */}

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
                openActivityRenameModal({ id: activity.id, name: activity.name })
              }
              onChangeCategory={handleChangeCategory}
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
    </>
  );
}
