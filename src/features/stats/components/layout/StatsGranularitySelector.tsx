'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/lib/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/lib/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import type { StatsGranularity } from '../../stores/useStatsFilterStore';

interface StatsGranularitySelectorProps {
  granularity: StatsGranularity;
  onGranularityChange: (granularity: StatsGranularity) => void;
  className?: string;
}

const GRANULARITY_OPTIONS: { value: StatsGranularity; labelKey: string }[] = [
  { value: 'day', labelKey: 'periodDay' },
  { value: 'week', labelKey: 'periodWeek' },
  { value: 'month', labelKey: 'periodMonth' },
  { value: 'year', labelKey: 'periodYear' },
];

/**
 * Stats 粒度セレクター
 *
 * CalendarHeader の ViewSwitcher と同じドロップダウンボタン形式。
 */
export function StatsGranularitySelector({
  granularity,
  onGranularityChange,
  className,
}: StatsGranularitySelectorProps) {
  const t = useTranslations('calendar.stats');

  const currentLabel = t(
    GRANULARITY_OPTIONS.find((opt) => opt.value === granularity)?.labelKey ?? 'periodWeek',
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          'justify-start gap-0 text-sm',
          className,
        )}
      >
        <span>{currentLabel}</span>
        <ChevronDown className="ml-2 h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" sideOffset={8} className="min-w-32">
        {GRANULARITY_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onGranularityChange(option.value)}
            className="flex items-center justify-between gap-2"
          >
            <span>{t(option.labelKey)}</span>
            {granularity === option.value ? (
              <Check className="text-primary h-4 w-4" />
            ) : (
              <span className="w-4" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
