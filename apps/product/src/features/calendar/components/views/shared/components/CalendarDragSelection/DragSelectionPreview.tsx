'use client';

/**
 * ドラッグ選択のプレビュー表示コンポーネント
 *
 * InlineTagPaletteのハイライトと同じデザインで統一。
 * 重複時のみ赤背景 + エラーメッセージを表示。
 */

import { memo } from 'react';

import { useTranslations } from 'next-intl';

import { entryTintColor } from '@/features/entry';
import { cn } from '@/lib/utils';

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
 * - InlineTagPaletteのハイライトと同じ見た目（entry-default + 時間ラベル）
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
  const tEntry = useTranslations('entry');

  // 選択範囲のスタイルを計算
  const startMinutes = selection.startHour * 60 + selection.startMinute;
  const endMinutes = selection.endHour * 60 + selection.endMinute;
  const top = startMinutes * (hourHeight / 60);
  const height = (endMinutes - startMinutes) * (hourHeight / 60);

  const timeLabel = `${formatTime(selection.startHour, selection.startMinute)} – ${formatTime(selection.endHour, selection.endMinute)}`;

  // 過去時間帯は保存時に自動で unplanned になるため、preview もダッシュ枠の unplanned 風に切替える。
  const nowForPastCheck = Date.now();
  const endDateTime = new Date(date);
  endDateTime.setHours(selection.endHour, selection.endMinute, 0, 0);
  const isPast = endDateTime.getTime() <= nowForPastCheck;

  // 重複時は全面 destructive 化（drag/resize のゴーストと同一の ConflictOverlay に統一）
  if (isOverlapping) {
    return (
      <ConflictOverlay
        message={tEntry('errors.timeOverlap')}
        timeLabel={timeLabel}
        compact={height < 40}
        className="pointer-events-none absolute right-0 left-0"
        style={{ top, height, zIndex: 1000 }}
      />
    );
  }

  // 通常時: EntryCardと同じデザイン（左アクセント + tint 塗り + 右角丸 + 時間）
  // 過去時間帯（unplanned 風）も確定後カードと同じ作り: アクセント + tint 塗り + 3 辺破線のみ差分
  const isCompact = height < 40;

  return (
    <div
      className={cn(
        'pointer-events-none absolute right-0 left-0 flex rounded-r-lg',
        isPast && 'border-entry-default border-t-2 border-r-2 border-b-2 border-dashed',
      )}
      style={{
        top,
        height,
        zIndex: 1000,
      }}
    >
      {/* upcoming はアクセント無し。文言位置を合わせる 3px スペーサーのみ（本体と同色で不可視）。 */}
      <div
        className="shrink-0"
        style={{ width: '3px', backgroundColor: entryTintColor('var(--entry-default)') }}
      />
      {/* カード本体 — EntryCard と同じ 18% color-mix tint（neutral base） */}
      <div
        className="min-w-0 flex-1 overflow-hidden rounded-r-lg"
        style={{ backgroundColor: entryTintColor('var(--entry-default)') }}
      >
        {isCompact ? (
          <div className="flex h-full items-center px-2">
            <span className="text-muted-foreground truncate text-xs tabular-nums">{timeLabel}</span>
          </div>
        ) : (
          <div className="flex h-full flex-col gap-1 p-2">
            <span className="text-muted-foreground text-sm leading-tight font-normal">
              {tCalendar('event.selectTag')}
            </span>
            <span className="text-muted-foreground text-xs leading-tight tabular-nums">
              {timeLabel}
            </span>
          </div>
        )}
      </div>
    </div>
  );
});
