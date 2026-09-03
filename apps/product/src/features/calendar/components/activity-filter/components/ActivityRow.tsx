'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { Eye, EyeOff, MoreHorizontal } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import type { Activity } from '@/features/activities';
import { cn, DropdownMenu, DropdownMenuTrigger, HoverTooltip } from '@dayopt/components';

import { useActivityModalNavigation } from '../../../hooks/useActivityModalNavigation';
import { buildReportPath } from '../../../lib/panel-url';
import { DROP_TARGET_UNCATEGORIZED } from '../activity-drop-target';
import { useActivityDragSource } from '../useActivityDragHandlers';
import { useMoveActivityToCategory } from '../useMoveActivityToCategory';

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
  const moveActivity = useMoveActivityToCategory(allActivities);
  const { openActivityRenameModal } = useActivityModalNavigation();

  const [menuOpen, setMenuOpen] = useState(false);

  const isPopoverOpen = openPopoverActivityId === activity.id;

  // メニュー / ポップオーバーを開いている行は drag source にしない。Radix の
  // portal が開いている最中に掴まれると、開いたまま行だけが飛ぶ
  const { isDragging, dragProps } = useActivityDragSource(
    activity,
    !isMobile && !menuOpen && !isPopoverOpen,
  );

  // 同名衝突の判定・toast・mutation は DnD と共有する（useMoveActivityToCategory）
  const handleChangeCategory = useCallback(
    (newCategoryId: string | null) => {
      moveActivity(activity, newCategoryId ?? DROP_TARGET_UNCATEGORIZED);
    },
    [moveActivity, activity],
  );

  const handleViewStats = useCallback(() => {
    // カレンダー内パネル（CalendarReviewRail）は廃止済み（#2181 Step 4）。
    // tagId によるセグメント絞り込みは Step 5（セグメント配線）で復元する。
    router.push(buildReportPath(locale, new Date()));
  }, [router, locale]);

  return (
    <>
      <div role="listitem">
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- キーボード経路は内側の名前 button が持つ。この onClick は行の余白までクリックできるようにするマウス用の拡張で、role を付けると内側の button が入れ子の interactive 要素になり ARIA として不正になる */}
        <div
          className={cn(
            // select-none: 付けないと Firefox でラベルの文字列選択ドラッグが
            // 先に始まり、行の drag が開始しない
            'group/item relative flex cursor-pointer items-center rounded-lg text-sm select-none',
            isMobile ? 'h-11' : 'h-8',
            'hover:bg-state-hover',
            (menuOpen || isPopoverOpen) && 'bg-state-selected',
            // 掴んでいる行。ドラッグ画像はブラウザが作る半透明の複製なので、
            // ここで opacity を足すと二重に薄くなる。地色だけ変える
            isDragging && 'bg-state-dragged',
          )}
          onClick={(event) => {
            // メニュー項目のクリックは行まで波及させない。Radix の portal でも
            // React の合成イベントはコンポーネントツリーを遡るため、素通しだと
            // 項目を押すたびにクイック作成ポップオーバーが裏で開く
            if ((event.target as HTMLElement).closest('[role="menu"]')) return;
            onOpenPopover(activity.id);
          }}
          {...dragProps}
        >
          {/* アクティビティ行にアイコンは出さない（2026-08-18 User 指示）。
              カテゴリー配下では見出しのアイコンをそのまま繰り返すことになり、
              未分類では継承する色が無い。どちらも情報を足さずノイズになる。
              色とアイコンを見せるのはカテゴリー見出しだけ */}

          {/* 名前は button。行全体の onClick はマウス用にヒット領域を広げるための
              ものなので、キーボードから同じ操作へ届く経路をここが担う。行の div を
              role="button" にすると内側の 👁 / ⋯ が入れ子の interactive 要素になり
              ARIA として不正になるため、行ではなく名前を control にする */}
          <HoverTooltip
            content={activity.name}
            side="top"
            disabled={menuOpen || isDragging}
            wrapperClassName="ml-2 min-w-0 flex-1"
          >
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenPopover(activity.id);
              }}
              className={cn(
                'focus-visible:ring-ring block w-full min-w-0 truncate rounded-lg text-left focus-visible:ring-2 focus-visible:outline-none',
                !checked && 'text-muted-foreground',
              )}
            >
              {activity.name}
            </button>
          </HoverTooltip>

          <button
            type="button"
            // 掴み判定から外す目印。行の名前も button なので closest('button') では
            // 区別できない（useActivityDragHandlers）
            data-row-action
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            aria-label={checked ? t('calendar.filter.hide') : t('calendar.filter.show')}
            className={cn(
              // eslint-disable-next-line tailwindcss/no-arbitrary-value -- 擬似要素のヒットエリア拡張に before:content-[''] の空文字指定が必須
              "text-muted-foreground hover:text-foreground hover:bg-state-hover focus-visible:ring-ring relative flex size-6 shrink-0 items-center justify-center rounded-lg transition-opacity before:absolute before:-inset-2 before:content-[''] focus-visible:ring-2 focus-visible:outline-none",
              checked
                ? 'opacity-0 group-hover/item:opacity-100 group-has-[:focus-visible]/item:opacity-100 focus-visible:opacity-100'
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
                data-row-action
                aria-label={t('calendar.filter.activityMenu')}
                // eslint-disable-next-line tailwindcss/no-arbitrary-value -- 擬似要素の 44px ヒットエリアに空 content が必要
                className="text-muted-foreground hover:text-foreground hover:bg-state-hover focus-visible:ring-ring relative flex size-6 shrink-0 items-center justify-center rounded-lg opacity-0 transition-opacity group-hover/item:opacity-100 group-has-[:focus-visible]/item:opacity-100 after:absolute after:inset-0 after:m-auto after:size-11 after:content-[''] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none [@media(hover:none)]:opacity-100"
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
