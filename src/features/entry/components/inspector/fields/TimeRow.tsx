'use client';

/**
 * 汎用の時間入力行
 *
 * ラベル + TimeSelect × 2（開始→終了）+ Duration表示
 * 予定行にも記録行にも使える。
 */

import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';

import { cn } from '@/lib/utils';

import { TimeSelect } from './TimeSelect';

interface TimeRowProps {
  label: string;
  icon?: LucideIcon;
  startTime: string;
  endTime: string;
  onStartChange: (time: string) => void;
  onEndChange: (time: string) => void;
  disabled?: boolean;
  hasError?: boolean;
  /** true で記録行（実績）を視覚的に強調 */
  isPrimary?: boolean;
  /** true で breakpoint に関係なく常に 1 行表示（popover / bottom sheet 等、十分な横幅がある場合） */
  forceSingleRow?: boolean;
}

/** Inspectorの時間入力行（開始・終了のTimeSelect × 2、予定行・記録行共用） */
export function TimeRow({
  label,
  icon: Icon,
  startTime,
  endTime,
  onStartChange,
  onEndChange,
  disabled = false,
  hasError = false,
  isPrimary = false,
  forceSingleRow = false,
}: TimeRowProps) {
  return (
    <div
      className={cn(
        'flex min-h-11',
        forceSingleRow
          ? 'flex-row items-center justify-between gap-0'
          : 'flex-col gap-1 md:flex-row md:items-center md:justify-between md:gap-0',
      )}
    >
      <div className="flex items-center gap-2">
        {Icon && <Icon className="text-muted-foreground size-4 flex-shrink-0" />}
        <span
          className={cn(
            'text-sm',
            isPrimary ? 'text-foreground font-medium' : 'text-muted-foreground',
          )}
        >
          {label}
        </span>
      </div>
      <div className="-mr-2 flex items-center gap-1">
        <TimeSelect
          value={startTime}
          onChange={onStartChange}
          disabled={disabled}
          hasError={hasError}
        />
        <ArrowRight className="text-muted-foreground size-3.5 flex-shrink-0" />
        <TimeSelect
          value={endTime}
          onChange={onEndChange}
          disabled={disabled || !startTime}
          minTime={startTime}
          showDurationInMenu
          hasError={hasError}
        />
      </div>
    </div>
  );
}

interface TimeRowPlaceholderProps {
  label: string;
  icon?: LucideIcon;
  message: string;
  muted?: boolean;
}

/** 時間未設定時のプレースホルダー表示行（メッセージのみ、TimeSelectなし） */
export function TimeRowPlaceholder({
  label,
  icon: Icon,
  message,
  muted = false,
}: TimeRowPlaceholderProps) {
  return (
    <div className="flex min-h-11 flex-col gap-1 md:flex-row md:items-center md:justify-between md:gap-0">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="text-muted-foreground size-4 flex-shrink-0" />}
        <span className="text-muted-foreground text-sm">{label}</span>
      </div>
      <span className={cn('text-muted-foreground -mr-2 px-2 text-sm', muted && 'opacity-60')}>
        {message}
      </span>
    </div>
  );
}
