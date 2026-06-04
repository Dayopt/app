'use client';

/**
 * ConflictOverlay — 重複検出時の destructive 表示（all-red 規範）
 *
 * ドラッグ（ゴースト）とリサイズで共通利用する。
 * 「この時間帯には既に予定があります」メッセージとプレビュー時刻を縦に並べ、
 * 全面を destructive-tint で覆う。配置（h-full / absolute inset-0 等）は
 * className で呼び出し側に委ねる。
 */

import { cn } from '@/lib/utils';

import type { TimeRange } from '../../../../domain/interaction/types';

/** 重複時に表示する destructive オーバーレイ */
export function ConflictOverlay({
  previewTime,
  message,
  className,
}: {
  previewTime: TimeRange;
  message: string;
  className?: string;
}) {
  const startH = previewTime.start.getHours();
  const startM = String(previewTime.start.getMinutes()).padStart(2, '0');
  const endH = previewTime.end.getHours();
  const endM = String(previewTime.end.getMinutes()).padStart(2, '0');
  return (
    <div
      className={cn(
        'bg-destructive-tint text-destructive flex flex-col gap-1 overflow-hidden rounded-lg p-2',
        className,
      )}
    >
      <span className="text-sm leading-tight font-medium">{message}</span>
      <span className="text-xs leading-tight tabular-nums">
        {startH}:{startM} – {endH}:{endM}
      </span>
    </div>
  );
}
