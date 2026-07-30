'use client';

/**
 * ドラッグ選択のプレビュー表示コンポーネント
 *
 * Plan / Record の2レーンカードと同じデザインで統一。
 * 重複時のみ赤背景 + エラーメッセージを表示。
 */

import { memo } from 'react';

import { useTranslations } from 'next-intl';

import { cn } from '@dayopt/components';

import { DEFAULT_PLAN_LANE_WIDTH_PERCENT } from '../../../../../lib/two-lane-layout';
import { HOUR_HEIGHT } from '../../constants/grid.constants';
import { ConflictOverlay } from '../ConflictOverlay';

import type { TimeRange } from './types';

interface DragSelectionPreviewProps {
  selection: TimeRange;
  /** この列の日付（past 判定に使用） */
  date: Date;
  formatTime: (hour: number, minute: number) => string;
  /** 既存プランと重複しているか */
  isOverlapping?: boolean;
  /** 1時間あたりの高さ（px） */
  hourHeight?: number | undefined;
}

/**
 * ドラッグ選択範囲のプレビュー表示
 * - Plan は左レーンのアウトライン、Record は右レーンの塗りカード
 * - 重複時は赤背景でエラー表示
 */
export const DragSelectionPreview = memo(function DragSelectionPreview({
  selection,
  date,
  formatTime,
  isOverlapping = false,
  hourHeight = HOUR_HEIGHT,
}: DragSelectionPreviewProps) {
  const tCalendar = useTranslations('calendar');
  const tEntry = useTranslations('timeblock');

  // 選択範囲のスタイルを計算
  const startMinutes = selection.startHour * 60 + selection.startMinute;
  const endMinutes = selection.endHour * 60 + selection.endMinute;
  const top = startMinutes * (hourHeight / 60);
  const height = (endMinutes - startMinutes) * (hourHeight / 60);

  const timeLabel = `${formatTime(selection.startHour, selection.startMinute)} – ${formatTime(selection.endHour, selection.endMinute)}`;

  // 保存先と同じ境界条件: end > now は Plan、それ以外は Record。
  const nowForPastCheck = Date.now();
  const endDateTime = new Date(date);
  endDateTime.setHours(selection.endHour, selection.endMinute, 0, 0);
  const kind = endDateTime.getTime() > nowForPastCheck ? 'plan' : 'record';
  const isPlan = kind === 'plan';
  const left = isPlan ? 0 : DEFAULT_PLAN_LANE_WIDTH_PERCENT;
  const width = isPlan ? DEFAULT_PLAN_LANE_WIDTH_PERCENT : 100 - DEFAULT_PLAN_LANE_WIDTH_PERCENT;
  const destinationLabel = tCalendar(`event.preview.${kind}`);

  // 重複時は全面 destructive 化（drag/resize のゴーストと同一の ConflictOverlay に統一）
  if (isOverlapping) {
    return (
      <ConflictOverlay
        message={tEntry('errors.timeOverlap')}
        timeLabel={timeLabel}
        compact={height < 40}
        className="pointer-events-none absolute"
        style={{ top, left: `${left}%`, width: `calc(${width}% - 4px)`, height, zIndex: 1000 }}
      />
    );
  }

  // 通常時: 確定後の TwoLane カードと同じレーン位置・surface・角丸・余白。
  const isCompact = height < 40;

  return (
    <div
      data-drag-selection-preview={kind}
      // elevation-exempt: ドラッグ中の一時ゴースト。影は GhostRenderer 側が持つ
      className={cn(
        'text-foreground pointer-events-none absolute flex flex-col gap-1 overflow-hidden rounded-lg px-2 py-2 text-xs',
        isPlan ? 'border-border border-2 bg-transparent' : 'bg-card',
      )}
      style={{
        top,
        left: `${left}%`,
        width: `calc(${width}% - 4px)`,
        height,
        zIndex: 1000,
      }}
    >
      {isCompact ? (
        <span className="truncate font-medium">
          {destinationLabel} · <span className="tabular-nums">{timeLabel}</span>
        </span>
      ) : (
        <>
          <div className="flex min-h-0 items-start justify-between gap-1">
            <span className="truncate font-medium">{tCalendar('event.selectTag')}</span>
            <span className="text-muted-foreground shrink-0">{destinationLabel}</span>
          </div>
          <span className="text-muted-foreground truncate tabular-nums">{timeLabel}</span>
        </>
      )}
    </div>
  );
});
