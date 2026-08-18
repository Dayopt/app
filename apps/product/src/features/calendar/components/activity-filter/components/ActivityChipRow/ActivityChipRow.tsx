'use client';

import { useMemo, useState } from 'react';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { TagIcon, useTags, type Tag } from '@/features/tags';
import { useShellStore } from '@/lib/stores/useShellStore';
import { cn } from '@dayopt/components';

import { ActivityTimeblockCreatePopover } from '../ActivityTimeblockCreatePopover';

interface ActivityChipRowProps {
  className?: string;
}

/**
 * active なアクティビティだけを名前順で返す。
 *
 * PC サイドバー（`partitionActivityTree`）と同じ `Intl.Collator` を使い、
 * 両者の並びが食い違わないようにする（`sort_order` は DnD 撤去で廃止済み）。
 */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function sortActiveActivities(activities: Tag[] | undefined): Tag[] {
  if (!activities) return [];
  return activities
    .filter((activity) => activity.is_active !== false)
    .sort((a, b) => collator.compare(a.name, b.name));
}

/**
 * モバイル専用のアクティビティチップ行。
 *
 * - タイムライン下部の固定フッターに横一列で並ぶ（カテゴリー所属・未分類が混在）
 * - タップで bottom sheet `ActivityTimeblockCreatePopover` を開き、時刻指定してエントリ作成
 * - 行末に「+」ボタンを置き新規アクティビティを作成
 * - データソース: `useTags()`（sidebar と同じ cache を参照、追加 fetch ゼロ）
 * - 並び順: 名前順（PC sidebar と一致。`sort_order` は DnD 撤去で廃止）
 * - `is_active === false` は除外
 * - 0 件なら null を返す（行ごと非表示。初回作成は別導線）
 */
export function ActivityChipRow({ className }: ActivityChipRowProps) {
  const t = useTranslations();
  const { data: tags } = useTags();
  const [openActivityId, setOpenActivityId] = useState<string | null>(null);

  const openActivityCreateModal = useShellStore.use.openTagCreateModal();

  const sortedActivities = useMemo(() => sortActiveActivities(tags), [tags]);
  const openActivity = useMemo(
    () => sortedActivities.find((activity) => activity.id === openActivityId) ?? null,
    [sortedActivities, openActivityId],
  );

  if (sortedActivities.length === 0) return null;

  const handleActivityTap = (activityId: string) => {
    setOpenActivityId(activityId);
  };

  return (
    <div
      className={cn(
        'bg-surface-container border-border-subtle z-bottom-tab pb-safe fixed inset-x-0 bottom-0 flex min-h-14 items-center gap-1 overflow-x-auto border-t px-2 pt-1',
        // タップ領域を広く保ちつつ、横スクロール時のバウンスを抑える + スクロールバー非表示
        'scrollbar-hide overscroll-x-contain',
        className,
      )}
      role="list"
      aria-label={t('calendar.filter.quickCreate')}
    >
      {sortedActivities.map((activity) => {
        const label = activity.name;
        return (
          <button
            key={activity.id}
            type="button"
            role="listitem"
            onClick={() => handleActivityTap(activity.id)}
            className="hover:bg-state-hover flex h-12 min-w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-2 transition-colors duration-150"
          >
            <TagIcon icon={activity.icon} color={activity.color} size="md" />
            <span className="text-muted-foreground max-w-16 truncate text-xs">{label}</span>
          </button>
        );
      })}

      <button
        type="button"
        role="listitem"
        aria-label={t('calendar.filter.createActivity')}
        onClick={() => openActivityCreateModal()}
        className="hover:bg-state-hover text-muted-foreground flex h-12 min-w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-2 transition-colors duration-150"
      >
        <Plus className="size-5" />
        <span className="max-w-16 truncate text-xs">{t('common.actions.add')}</span>
      </button>

      {openActivity && (
        <ActivityTimeblockCreatePopover
          open={true}
          onOpenChange={(o: boolean) => {
            if (!o) setOpenActivityId(null);
          }}
          activity={openActivity}
          isMobile
        />
      )}
    </div>
  );
}
