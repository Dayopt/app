'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useTagModalNavigation } from '../../../hooks/useTagModalNavigation';

import { Button } from '@/lib/components/ui/button';
import { HoverTooltip } from '@/lib/components/ui/tooltip';

/** 新規タグ作成モーダルを開くボタンコンポーネント */
export function CreateTagButton() {
  const t = useTranslations();
  const { openTagCreateModal } = useTagModalNavigation();

  return (
    <HoverTooltip content={t('calendar.filter.createTag')} side="top">
      <Button
        variant="ghost"
        icon
        className="size-6"
        onClick={() => openTagCreateModal()}
        aria-label={t('calendar.filter.createTag')}
      >
        <Plus className="size-4" />
      </Button>
    </HoverTooltip>
  );
}
