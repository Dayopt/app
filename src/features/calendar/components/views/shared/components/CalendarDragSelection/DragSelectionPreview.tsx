'use client';

/**
 * ドラッグ選択のプレビュー表示コンポーネント
 *
 * InlineTagPaletteのハイライトと同じデザインで統一。
 * 重複時のみ赤背景 + エラーメッセージを表示。
 */

import { memo } from 'react';

import { Ban } from 'lucide-react';
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
  const t = useTranslations('calendar');

  // 選択範囲のスタイルを計算
  const startMinutes = selection.startHour * 60 + selection.startMinute;
  const endMinutes = selection.endHour * 60 + selection.endMinute;
  const top = startMinutes * (hourHeight / 60);
  const height = (endMinutes - startMinutes) * (hourHeight / 60);

  const timeLabel = `${formatTime(selection.startHour, selection.startMinute)} – ${formatTime(selection.endHour, selection.endMinute)}`;

  // 合計時間
  const totalMinutes = endMinutes - startMinutes;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const durationText =
    hours > 0 ? (minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`) : `${minutes}m`;

  // 重複時は赤背景でエラー表示
  if (isOverlapping) {
    return (
      <div
        className="bg-destructive border-destructive/50 pointer-events-none absolute right-0 left-0 rounded border"
        style={{ top, height, zIndex: 1000 }}
      >
        <div className="flex items-center gap-1 px-2 py-1">
          <Ban className="text-destructive-foreground size-3 flex-shrink-0" />
          <span className="text-destructive-foreground text-xs font-medium">
            {t('toast.conflict')}
          </span>
        </div>
      </div>
    );
  }

  // 通常時: PlanCardと同じデザイン（左ボーダーアクセント + 右角丸）
  return (
    <div
      className="pointer-events-none absolute right-0 left-0 rounded-r-lg border-l-[3px]"
      style={{
        top,
        height,
        zIndex: 1000,
        borderLeftColor: 'var(--entry-default)',
        backgroundColor: 'color-mix(in oklch, var(--entry-default) 12%, var(--background))',
      }}
    >
      <div className="flex h-full flex-col justify-between p-2">
        <span className="text-foreground text-sm font-semibold tabular-nums">{timeLabel}</span>
        <span className="text-muted-foreground text-sm font-medium tabular-nums">
          {durationText}
        </span>
      </div>
    </div>
  );
});
