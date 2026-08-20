'use client';

/**
 * ConflictOverlay — 重複検出時の destructive 表示（all-red 規範）
 *
 * ドラッグ（ゴースト）/ リサイズ / 新規ドラッグ選択で共通利用する。
 * 「この時間帯には既に予定があります」メッセージと時刻を縦に並べ、
 * 全面を destructive-tint で覆う。配置（h-full / absolute inset-0 等）は
 * className で呼び出し側に委ねる。
 *
 * - 時刻ラベルは `timeLabel`（12h/24h 整形済み文字列）優先、無ければ
 *   `previewTime` と `timeFormat` から算出する。
 * - `compact`（小さいブロック向け）はメッセージ 1 行のみを縦中央に表示する。
 */

import type React from 'react';

import { formatTimeRange } from '@/lib/date';
import type { TimeFormat } from '@/lib/time';
import { cn } from '@dayopt/components';

import type { TimeRange } from '../../../../domain/interaction/types';

/** 重複時に表示する destructive オーバーレイ */
export function ConflictOverlay({
  message,
  previewTime,
  timeLabel,
  timeFormat = '24h',
  compact = false,
  className,
  style,
}: {
  message: string;
  /** 時刻算出元。`timeLabel` を渡す場合は省略可 */
  previewTime?: TimeRange;
  /** 整形済み時刻ラベル（12h/24h 対応）。指定時は previewTime より優先 */
  timeLabel?: string;
  /** previewTime を整形する時刻表記 */
  timeFormat?: TimeFormat;
  /** 小さいブロック向け: メッセージ 1 行のみ縦中央表示 */
  compact?: boolean;
  className?: string;
  /** リサイズ時に TimeblockCard より前面へ重ねるための z-index 等を渡す */
  style?: React.CSSProperties;
}) {
  const resolvedLabel =
    timeLabel ??
    (previewTime ? formatTimeRange(previewTime.start, previewTime.end, timeFormat, ' – ') : null);

  if (compact) {
    return (
      <div
        className={cn(
          'bg-destructive-tint text-destructive flex items-center overflow-hidden rounded-lg px-2',
          className,
        )}
        style={style}
      >
        <span className="truncate text-xs font-normal">{message}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'bg-destructive-tint text-destructive flex flex-col gap-1 overflow-hidden rounded-lg p-2',
        className,
      )}
      style={style}
    >
      <span className="text-sm leading-tight font-medium">{message}</span>
      {resolvedLabel && <span className="text-xs leading-tight tabular-nums">{resolvedLabel}</span>}
    </div>
  );
}
