'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { DropdownMenuItem } from '@dayopt/components';
import { TAG_COLOR_MAP, TAG_COLOR_NAMES, resolveTagColor } from '../lib/tag-colors';

import type { TagColorName } from '../lib/tag-colors';

/**
 * 翻訳済みの色表示名を取得する
 *
 * @param color - タグカラー名
 * @param t - useTranslations() の返り値（'common' namespace）
 */
export function getColorDisplayName(color: TagColorName, t: (key: string) => string): string {
  return t(`colors.${color}`);
}

/**
 * カラーパレットメニューアイテム（DropdownMenu用）
 * DropdownMenuContent / DropdownMenuSubContent の中で使用
 */
interface ColorPaletteMenuItemsProps {
  selectedColor: string;
  onColorSelect: (color: TagColorName) => void;
}

export function ColorPaletteMenuItems({
  selectedColor,
  onColorSelect,
}: ColorPaletteMenuItemsProps) {
  const t = useTranslations('common');
  const resolvedSelected = resolveTagColor(selectedColor);

  return (
    <>
      {TAG_COLOR_NAMES.map((colorName) => {
        const isSelected = resolvedSelected === colorName;
        const displayName = getColorDisplayName(colorName, t);

        return (
          <DropdownMenuItem
            key={colorName}
            onClick={() => onColorSelect(colorName)}
            className="hover:bg-state-hover"
          >
            <span
              className={cn('mr-2 h-4 w-4 rounded-full', TAG_COLOR_MAP[colorName].dot)}
              aria-hidden
            />
            <span className="flex-1">{displayName}</span>
            {isSelected && <Check className="text-primary ml-2 h-4 w-4" />}
          </DropdownMenuItem>
        );
      })}
    </>
  );
}
