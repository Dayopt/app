'use client';

import { useCallback } from 'react';

import { Check, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/lib/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/lib/components/ui/dropdown-menu';
import { useShellStore } from '@/lib/stores/useShellStore';
import { useUserPreferenceStore } from '@/lib/stores/useUserPreferenceStore';
import { toast } from '@/lib/toast';
import { api } from '@/lib/trpc';
import { cn } from '@/lib/utils';

import type { ReviewGranularity } from '../../stores/useReviewFilterStore';

interface ReviewGranularitySelectorProps {
  granularity: ReviewGranularity;
  onGranularityChange: (granularity: ReviewGranularity) => void;
  className?: string;
}

const GRANULARITY_OPTIONS: { value: ReviewGranularity; labelKey: string }[] = [
  { value: 'day', labelKey: 'periodDay' },
  { value: 'week', labelKey: 'periodWeek' },
];

/**
 * Stats 粒度セレクター
 *
 * CalendarHeader の ViewSwitcher と同じドロップダウンボタン形式。
 */
export function ReviewGranularitySelector({
  granularity,
  onGranularityChange,
  className,
}: ReviewGranularitySelectorProps) {
  const t = useTranslations();
  const showWeekNumbers = useUserPreferenceStore((s) => s.showWeekNumbers);
  const updatePreferences = useUserPreferenceStore((s) => s.updatePreferences);
  const utils = api.useUtils();

  const updateMutation = api.userSettings.update.useMutation({
    onMutate: (settings) => {
      const previousShowWeekNumbers = useUserPreferenceStore.getState().showWeekNumbers;
      if (typeof settings.showWeekNumbers === 'boolean') {
        updatePreferences({ showWeekNumbers: settings.showWeekNumbers });
      }
      return { previousShowWeekNumbers };
    },
    onSuccess: () => {
      utils.userSettings.get.invalidate();
    },
    onError: (_error, _settings, context) => {
      if (context) {
        updatePreferences({ showWeekNumbers: context.previousShowWeekNumbers });
      }
      toast.error(t('settings.common.saveFailed'));
    },
  });

  const currentLabel = t(
    `calendar.stats.${GRANULARITY_OPTIONS.find((opt) => opt.value === granularity)?.labelKey ?? 'periodWeek'}`,
  );

  const handleToggleWeekNumbers = useCallback(() => {
    updateMutation.mutate({ showWeekNumbers: !showWeekNumbers });
  }, [showWeekNumbers, updateMutation]);

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
        <ChevronDown className="ml-2 size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" sideOffset={8} className="min-w-48">
        {GRANULARITY_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onGranularityChange(option.value)}
            className="flex items-center justify-between gap-2"
          >
            <span>{t(`calendar.stats.${option.labelKey}`)}</span>
            {granularity === option.value ? (
              <Check className="text-primary size-4" />
            ) : (
              <span className="w-4" />
            )}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span>{t('calendar.views.viewSettings')}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuCheckboxItem
              checked={showWeekNumbers}
              onCheckedChange={handleToggleWeekNumbers}
              disabled={updateMutation.isPending}
            >
              {t('calendar.views.showWeekNumbers')}
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => useShellStore.getState().openSettings('display')}>
              {t('calendar.views.generalSettings')}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
