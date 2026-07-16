/**
 * TimeblockCard の空き枠（unexecuted gap）ゾーン
 *
 * 予定はあったが実績が届いていない部分。クリックで空き時間の記録作成を導線する。
 * 上端・下端どちらにも使う。
 */

import { Plus } from 'lucide-react';

import { cn } from '@dayopt/components';

import { MIN_VISIBLE_GAP_ACTION_HEIGHT } from './useTimeblockCardLayout';

interface TimeblockCardGapZoneProps {
  side: 'top' | 'bottom';
  top: number;
  height: number;
  clickEnabled: boolean;
  startMinutes: number | null;
  endMinutes: number | null;
  onGapClick: ((startMinutes: number, endMinutes: number) => void) | undefined;
  label: string;
}

export function TimeblockCardGapZone({
  side,
  top,
  height,
  clickEnabled,
  startMinutes,
  endMinutes,
  onGapClick,
  label,
}: TimeblockCardGapZoneProps) {
  const handleActivate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (startMinutes == null || endMinutes == null) return;
    onGapClick?.(startMinutes, endMinutes);
  };

  return (
    <div
      data-entry-gap={side}
      aria-hidden={!clickEnabled ? true : undefined}
      role={clickEnabled ? 'button' : undefined}
      aria-label={clickEnabled ? label : undefined}
      className={cn(
        'absolute right-0 left-0',
        side === 'top' ? 'rounded-t-lg' : 'rounded-b-lg',
        clickEnabled ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none',
      )}
      style={{ top: `${top}px`, height: `${height}px` }}
      onMouseDown={clickEnabled ? (e) => e.stopPropagation() : undefined}
      onTouchStart={clickEnabled ? (e) => e.stopPropagation() : undefined}
      onClick={clickEnabled ? handleActivate : undefined}
    >
      {height >= MIN_VISIBLE_GAP_ACTION_HEIGHT && clickEnabled && (
        <span
          data-entry-gap-action
          className="bg-background/95 text-foreground border-border hover:bg-state-hover absolute top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm transition-colors"
          style={{ right: 'calc(25% - 10px)' }}
        >
          <Plus aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
        </span>
      )}
    </div>
  );
}
