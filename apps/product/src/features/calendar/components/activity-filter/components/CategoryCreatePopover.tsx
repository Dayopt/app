'use client';

import { useCallback, useState } from 'react';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { CategoryAppearancePickerRow, useCreateCategory } from '@/features/activities';
import {
  Button,
  HoverTooltip,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@dayopt/components';

import type { CategoryColorName } from '@/features/activities';

/**
 * サイドバー「カテゴリ」見出しのカテゴリー直接作成ボタン（#2211、#2406 で属性行を追加）。
 *
 * 「未分類」見出しの `+`（アクティビティ作成）と対称の配置・挙動 —
 * hover/focus 時だけ表示する。名前 Input に加え、色・アイコンの属性行
 * （`CategoryAppearancePickerRow`）を表示する。色・アイコンは未選択のままでも
 * 送信でき、その場合は `useCreateCategory` の既存デフォルトに従う（#2162 §4-6
 * 「色・アイコンはカテゴリーだけが持つ」モデルは変えない）ので、最小経路
 * （名前入力 → Enter）は 2 手のまま。
 */
interface CategoryCreatePopoverProps {
  /** popover の開閉を親へ通知する（見出しの hover-reveal を強制表示するため） */
  onOpenChange?: (open: boolean) => void;
}

export function CategoryCreatePopover({ onOpenChange }: CategoryCreatePopoverProps = {}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<CategoryColorName | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  const createCategoryMutation = useCreateCategory();

  const trimmedName = name.trim();
  const submitting = createCategoryMutation.isPending;
  const canSubmit = trimmedName.length > 0 && !submitting;

  const resetForm = useCallback(() => {
    setName('');
    setColor(null);
    setIcon(null);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      onOpenChange?.(next);
      if (!next) resetForm();
    },
    [onOpenChange, resetForm],
  );

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    try {
      await createCategoryMutation.mutateAsync({
        name: trimmedName,
        ...(color ? { color } : {}),
        ...(icon ? { icon } : {}),
      });
      resetForm();
      handleOpenChange(false);
    } catch {
      // mutation hook 側で toast 済み。popover は開いたまま
    }
  }, [canSubmit, createCategoryMutation, trimmedName, color, icon, resetForm, handleOpenChange]);

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
          <CategoryAppearancePickerRow
            color={color}
            onColorChange={setColor}
            icon={icon}
            onIconChange={setIcon}
          />
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
