'use client';

import { useMemo, useState } from 'react';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ActivityIcon, useActivities, useActivitiesMap } from '@/features/activities';

import { useActivityModalNavigation } from '../../../../hooks/useActivityModalNavigation';

import { cn } from '@dayopt/components';

import { ActivityTimeblockCreatePopover } from '../ActivityTimeblockCreatePopover';

interface ActivityChipRowProps {
  className?: string;
}

/**
 * モバイル専用のアクティビティチップ行。
 *
 * - タイムライン下部の固定フッターに横一列で並ぶ（カテゴリー所属・未分類が混在）
 * - タップで bottom sheet `ActivityTimeblockCreatePopover` を開き、時刻指定してエントリ作成
 * - 行末に「+」ボタンを置き新規アクティビティを作成
 * - データソース: `useActivities()`（sidebar と同じ cache を参照、追加 fetch ゼロ）
 * - 並び順はサーバーの名前順に従う（`sort_order` は持たない）。PC サイドバーの
 *   `listTree` も同じ照合順序なので、client 側で並べ直すと逆にズレる
 * - アーカイブ済みは `useActivities()` の時点で除外済み
 * - 色とアイコンは所属カテゴリーから継承する。未分類は中立表示
 * - 0 件なら null を返す（行ごと非表示。初回作成は別導線）
 */
export function ActivityChipRow({ className }: ActivityChipRowProps) {
  const t = useTranslations();
  const { data: activities } = useActivities();
  const { getActivityById } = useActivitiesMap();
  const [openActivityId, setOpenActivityId] = useState<string | null>(null);

  const { openActivityCreateModal } = useActivityModalNavigation();

  const chips = useMemo(
    () =>
      (activities ?? []).map((activity) => {
        const display = getActivityById(activity.id);
        return {
          id: activity.id,
          name: activity.name,
          color: display?.color ?? null,
          icon: display?.icon ?? null,
        };
      }),
    [activities, getActivityById],
  );

  const openActivity = useMemo(
    () => chips.find((chip) => chip.id === openActivityId) ?? null,
    [chips, openActivityId],
  );

  if (chips.length === 0) return null;

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
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          role="listitem"
          onClick={() => handleActivityTap(chip.id)}
          className="hover:bg-state-hover flex h-12 min-w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-2 transition-colors duration-150"
        >
          <ActivityIcon
            icon={chip.icon}
            color={chip.color}
            size="md"
            neutral={chip.color === null}
          />
          <span className="text-muted-foreground max-w-16 truncate text-xs">{chip.name}</span>
        </button>
      ))}

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
