'use client';

import { GitCompareArrows } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button, cn, HoverTooltip } from '@dayopt/components';

interface CalendarCompareToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string | undefined;
}

/** 対応ビューの予定と実績の比較表示を切り替える。 */
export function CalendarCompareToggle({
  checked,
  onCheckedChange,
  className,
}: CalendarCompareToggleProps) {
  const t = useTranslations();

  return (
    <HoverTooltip content={t('calendar.compare.tooltip')} side="bottom">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        icon
        className={cn(
          'text-muted-foreground hover:text-foreground',
          checked && 'bg-state-selected text-foreground hover:bg-state-selected',
          className,
        )}
        aria-label={t('calendar.compare.ariaLabel')}
        aria-pressed={checked}
        onClick={() => onCheckedChange(!checked)}
      >
        <GitCompareArrows className="size-4" />
      </Button>
    </HoverTooltip>
  );
}
