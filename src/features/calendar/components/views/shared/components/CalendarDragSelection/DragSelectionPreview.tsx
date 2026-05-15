'use client';

/**
 * ドラッグ選択のプレビュー表示コンポーネント
 *
 * InlineTagPaletteのハイライトと同じデザインで統一。
 * 重複時のみ赤背景 + エラーメッセージを表示。
 */

import { memo } from 'react';

import { useTranslations } from 'next-intl';

import { HOUR_HEIGHT } from '../../constants/grid.constants';

import type { TimeRange } from './types';

interface DragSelectionPreviewProps {
  selection: TimeRange;
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

  // 重複時は全面 destructive 化（他の overlap visual と同じ規範）
  if (isOverlapping) {
    const isCompact = height < 40;
    return (
      <div
        className="bg-destructive-tint text-destructive pointer-events-none absolute right-2 left-0 overflow-hidden rounded-lg"
        style={{ top, height, zIndex: 1000 }}
      >
        {isCompact ? (
          <div className="flex h-full items-center px-2">
            <span className="truncate text-xs font-normal">{tEntry('errors.timeOverlap')}</span>
          </div>
        ) : (
          <div className="flex h-full flex-col gap-1 p-2">
            <span className="text-sm leading-tight font-medium">
              {tEntry('errors.timeOverlap')}
            </span>
            <span className="text-xs leading-tight tabular-nums">{timeLabel}</span>
          </div>
        )}
      </div>
    );
  }

  // 通常時: EntryCardと同じデザイン（左アクセント + 右角丸 + タグ名 + 時間）
  const isCompact = height < 40;

  return (
    <div
      className="pointer-events-none absolute right-2 left-0 flex rounded-r-lg"
      style={{
        top,
        height,
        zIndex: 1000,
      }}
    >
      {/* 左アクセントストリップ */}
      <div className="bg-entry-default shrink-0" style={{ width: '3px' }} />
      {/* カード本体 */}
      <div className="bg-muted min-w-0 flex-1 overflow-hidden rounded-r-lg">
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
