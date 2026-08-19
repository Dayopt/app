'use client';

import { useCallback, useState } from 'react';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useCreateCategory } from '@/features/activities';
import {
  Button,
  HoverTooltip,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@dayopt/components';

/**
 * サイドバー「カテゴリ」見出しのカテゴリー直接作成ボタン（#2211）。
 *
 * 「未分類」見出しの `+`（アクティビティ作成）と対称の配置・挙動 —
 * hover/focus 時だけ表示し、軽量 popover で名前だけ入力する。
 * 色・アイコンは既存の自動割当に従う（`useCreateCategory` のデフォルト、
 * #2162 §4-6「色・アイコンはカテゴリーだけが持つ」モデルは変えない）。
 */
interface CategoryCreatePopoverProps {
  /** popover の開閉を親へ通知する（見出しの hover-reveal を強制表示するため） */
  onOpenChange?: (open: boolean) => void;
}

export function CategoryCreatePopover({ onOpenChange }: CategoryCreatePopoverProps = {}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const createCategoryMutation = useCreateCategory();

  const trimmedName = name.trim();
  const submitting = createCategoryMutation.isPending;
  const canSubmit = trimmedName.length > 0 && !submitting;

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      onOpenChange?.(next);
      if (!next) setName('');
    },
    [onOpenChange],
  );

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    try {
      await createCategoryMutation.mutateAsync({ name: trimmedName });
      setName('');
      handleOpenChange(false);
    } catch {
      // mutation hook 側で toast 済み。popover は開いたまま
    }
  }, [canSubmit, createCategoryMutation, trimmedName, handleOpenChange]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <HoverTooltip content={t('calendar.filter.createCategory')} side="top">
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            icon
            className="size-6"
            aria-label={t('calendar.filter.createCategory')}
          >
            <Plus className="size-4" />
          </Button>
        </PopoverTrigger>
      </HoverTooltip>
      <PopoverContent align="start" side="right" className="w-64 p-3">
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('calendar.filter.createDialog.categoryNamePlaceholder')}
            aria-label={t('calendar.filter.createCategory')}
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!canSubmit}
            className="self-end"
          >
            {t('calendar.filter.createCategory')}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
