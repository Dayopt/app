/**
 * TimeblockCard の Layer 2（actual = 記録）
 *
 * 予定外エントリではここに TimeblockCardContent を描画する。予定エントリは
 * 左アクセントストリップだけを見せ、本文は Content Layer 側が担当する。
 */

import type { TimeFormat } from '@dayopt/domain';

import type { getTagColorClasses } from '@/features/tags';
import { cn } from '@dayopt/components';

import type { CalendarEvent } from '../../types/calendar-event';
import { TimeblockCardContent } from './TimeblockCardContent';

interface TimeblockCardActualLayerProps {
  top: number;
  height: number;
  isActiveEntry: boolean;
  colorClasses: ReturnType<typeof getTagColorClasses> | null;
  accentWidth: number;
  isUnplanned: boolean;
  isMobile: boolean;
  actualBodyBorderRadius: string;
  actualBackgroundColor: string;
  unplannedBorderStyle: React.CSSProperties;
  contentEntry: CalendarEvent;
  tagName: string | null;
  tagColor?: string | null;
  tagIcon?: string | null;
  timeFormat: TimeFormat;
  previewTime: { start: Date; end: Date } | null;
}

export function TimeblockCardActualLayer({
  top,
  height,
  isActiveEntry,
  colorClasses,
  accentWidth,
  isUnplanned,
  isMobile,
  actualBodyBorderRadius,
  actualBackgroundColor,
  unplannedBorderStyle,
  contentEntry,
  tagName,
  tagColor = null,
  tagIcon = null,
  timeFormat,
  previewTime,
}: TimeblockCardActualLayerProps) {
  return (
    <div
      data-entry-actual-layer
      className="absolute right-0 left-0 flex"
      style={{
        top: `${top}px`,
        height: `${height}px`,
      }}
    >
      {/* 左アクセントストリップ（actual=記録のサイン。予定外にも表示）
          active 中は full intensity、それ以外は 70% で背景に引かせる（animation なしで brighter を表現） */}
      <div
        data-entry-actual-accent
        className={cn(
          'relative shrink-0',
          isActiveEntry ? 'opacity-100' : 'opacity-70',
          isActiveEntry && 'entry-live-accent',
          colorClasses ? colorClasses.dot : 'bg-entry-default',
        )}
        style={{ width: `${accentWidth}px` }}
      />

      {/* カード本体 — actual recorded を main として強調（planned bg 8% に対して 18%） */}
      <div
        data-entry-actual-body
        className={cn(
          'relative min-w-0 flex-1 overflow-hidden',
          height < 40
            ? isMobile
              ? 'flex items-center px-2 text-xs'
              : 'flex items-center px-2 text-xs'
            : isMobile
              ? 'flex items-start gap-1 px-2 pt-2 text-sm'
              : 'p-2 text-sm',
        )}
        style={{
          borderRadius: actualBodyBorderRadius,
          backgroundColor: actualBackgroundColor,
          // 予定外は破線枠を本体（アクセントの右）に当て、アクセントを横切らない
          ...(isUnplanned ? unplannedBorderStyle : {}),
        }}
      >
        {isUnplanned && (
          <TimeblockCardContent
            plan={contentEntry}
            tagName={tagName}
            tagColor={tagColor}
            tagIcon={tagIcon}
            isCompact={height < 40}
            showTime={height >= 30}
            timeFormat={timeFormat}
            previewTime={previewTime}
          />
        )}
      </div>
    </div>
  );
}
