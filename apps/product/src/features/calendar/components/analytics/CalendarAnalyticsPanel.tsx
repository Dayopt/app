'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { TagIcon, useTags } from '@/features/tags';
import {
  Button,
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@dayopt/components';

const ALL_SCOPE_VALUE = '__all__';

interface CalendarAnalyticsPanelProps {
  selectedTagId: string | null;
  onSelectedTagIdChange: (tagId: string | null) => void;
  onClose?: (() => void) | undefined;
  className?: string | undefined;
}

export function CalendarAnalyticsPanel({
  selectedTagId,
  onSelectedTagIdChange,
  onClose,
  className,
}: CalendarAnalyticsPanelProps) {
  const t = useTranslations();
  const { data: tags } = useTags();
  const activeTags = tags ?? [];

  return (
    <section
      className={cn('flex min-h-0 w-full flex-col', className)}
      aria-label={t('calendar.analysis.panel.title')}
    >
      <header className="shrink-0">
        <div className="flex h-12 items-center gap-2 px-4">
          <Select
            value={selectedTagId ?? ALL_SCOPE_VALUE}
            onValueChange={(value) => {
              onSelectedTagIdChange(value === ALL_SCOPE_VALUE ? null : value);
            }}
          >
            <SelectTrigger
              variant="ghost"
              size="sm"
              className="-ml-2 max-w-full min-w-0 flex-1 justify-start px-2 text-sm font-medium"
              aria-label={t('calendar.analysis.panel.scopeLabel')}
            >
              <SelectValue placeholder={t('calendar.analysis.panel.all')} />
            </SelectTrigger>
            <SelectContent align="start" className="w-64">
              <SelectItem value={ALL_SCOPE_VALUE}>{t('calendar.analysis.panel.all')}</SelectItem>
              {activeTags.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>
                  <TagIcon icon={tag.icon} color={tag.color} size="sm" />
                  <span className="truncate">{tag.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon
              className="text-muted-foreground hover:text-foreground -mr-2"
              onClick={onClose}
              aria-label={t('common.actions.close')}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </header>
      <div className="min-h-0 flex-1" aria-hidden="true" />
    </section>
  );
}
