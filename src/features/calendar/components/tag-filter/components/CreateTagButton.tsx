'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useTagModalNavigation } from '../../../hooks/useTagModalNavigation';

import { HoverTooltip } from '@/components/ui/tooltip';

export function CreateTagButton() {
  const t = useTranslations();
  const { openTagCreateModal } = useTagModalNavigation();

  return (
    <HoverTooltip content={t('calendar.filter.createTag')} side="top">
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground hover:bg-state-hover flex size-6 items-center justify-center rounded"
        onClick={() => openTagCreateModal()}
        aria-label={t('calendar.filter.createTag')}
      >
        <Plus className="size-4" />
      </button>
    </HoverTooltip>
  );
}
