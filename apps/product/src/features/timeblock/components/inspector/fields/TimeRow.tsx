'use client';

/**
 * 汎用の時間入力行
 *
 * ラベル + TimeInput × 2（開始→終了）。
 * 予定行にも記録行にも使える。
 */

import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';

import { cn } from '@dayopt/components';

import { TimeInput } from './TimeInput';

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
  /** E2E/アクセシビリティ確認用の安定セレクタ */
  testId?: string;
}

/** Inspectorの時間入力行（開始・終了のTimeInput × 2、予定行・記録行共用、常に 1 行表示） */
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
  testId,
}: TimeRowProps) {
  return (
    <div className="flex min-h-11 flex-row items-center justify-between gap-0" data-testid={testId}>
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
      <div className="flex items-center gap-1">
        <TimeInput
          kind="start"
          value={startTime}
          onChange={onStartChange}
          disabled={disabled}
          hasError={hasError}
          testId={testId ? `${testId}-start` : undefined}
        />
        <span className="inline-flex h-8 items-center">
          <ArrowRight className="text-muted-foreground size-3.5 flex-shrink-0 leading-none" />
        </span>
        <TimeInput
          kind="end"
          value={endTime}
          onChange={onEndChange}
          disabled={disabled || !startTime}
          minTime={startTime}
          hasError={hasError}
          testId={testId ? `${testId}-end` : undefined}
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

/** 時間未設定時のプレースホルダー表示行（メッセージのみ、TimeInputなし） */
export function TimeRowPlaceholder({
  label,
  icon: Icon,
  message,
  muted = false,
}: TimeRowPlaceholderProps) {
  return (
    <div className="flex min-h-11 flex-row items-center justify-between gap-0">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="text-muted-foreground size-4 flex-shrink-0" />}
        <span className="text-muted-foreground text-sm">{label}</span>
      </div>
      <span className={cn('text-muted-foreground text-sm', muted && 'opacity-60')}>{message}</span>
    </div>
  );
}
