'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/lib/components/ui/button';
import { HoverTooltip } from '@/lib/components/ui/tooltip';

interface CreateTagButtonProps {
  /** 押下で inline 作成フォームを表示するトリガー */
  onStart: () => void;
  /** 作成フォーム表示中は disabled 表示 */
  active?: boolean;
}

/** タグ新規作成の起動ボタン。押すと親が管理する inline フォームを開く */
export function CreateTagButton({ onStart, active = false }: CreateTagButtonProps) {
  const t = useTranslations();

  return (
    <HoverTooltip content={t('calendar.filter.createTag')} side="top">
      <Button
        variant="ghost"
        icon
        className="size-6"
        onClick={onStart}
        aria-label={t('calendar.filter.createTag')}
        aria-pressed={active}
        disabled={active}
      >
        <Plus className="size-4" />
      </Button>
    </HoverTooltip>
  );
}
