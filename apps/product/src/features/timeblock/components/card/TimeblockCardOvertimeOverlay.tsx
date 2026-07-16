/**
 * TimeblockCard の超過（overtime）オーバーレイ
 *
 * 予定より実績が超過した部分を破線枠だけで視覚的に伝える。上端・下端どちらにも使う。
 */

import type { getTagColorClasses } from '@/features/tags';
import { cn } from '@dayopt/components';

interface TimeblockCardOvertimeOverlayProps {
  side: 'top' | 'bottom';
  height: number;
  backgroundColor: string;
  isActiveEntry: boolean;
  colorClasses: ReturnType<typeof getTagColorClasses> | null;
  accentWidth: number;
  borderStyle: React.CSSProperties;
}

export function TimeblockCardOvertimeOverlay({
  side,
  height,
  backgroundColor,
  isActiveEntry,
  colorClasses,
  accentWidth,
  borderStyle,
}: TimeblockCardOvertimeOverlayProps) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute right-0 left-0 overflow-hidden"
      style={{
        [side]: 0,
        height: `${height}px`,
        backgroundColor,
      }}
    >
      <div
        data-entry-overtime-accent
        className={cn(
          'absolute left-0',
          isActiveEntry ? 'opacity-100' : 'opacity-70',
          isActiveEntry && 'entry-live-accent',
          colorClasses ? colorClasses.dot : 'bg-entry-default',
        )}
        style={{ top: 0, bottom: 0, width: `${accentWidth}px` }}
      />
      {/* 破線枠はアクセントの右端から開始（アクセントを横切らない） */}
      <div
        className="absolute top-0 right-0 bottom-0"
        style={{ left: `${accentWidth}px`, ...borderStyle }}
      />
    </div>
  );
}
