'use client';

/**
 * CategoryAppearanceMenuItems
 *
 * カテゴリーの色・アイコンを選択する DropdownMenu 用アイテム群。
 * 色・アイコンを持つのはカテゴリーだけ（アクティビティは所属カテゴリーの色を
 * 継承する）という新モデルの前提に立ち、DropdownMenuContent /
 * DropdownMenuSubContent の中で使う 2 つの named export を提供する:
 *
 * - `CategoryColorMenuItems` — カラーパレット選択（旧 tags の ColorPaletteMenuItems）
 * - `CategoryIconMenuItems` — アイコン選択（旧 tags の IconPickerDropdownItems）
 */

import { Check, icons } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn, DropdownMenuItem } from '@dayopt/components';
import {
  CATEGORY_COLOR_MAP,
  CATEGORY_COLOR_NAMES,
  resolveCategoryColor,
} from '../lib/category-colors';
import { CURATED_ICONS, kebabToPascal } from '../lib/curated-icons';

import type { CategoryColorName } from '../lib/category-colors';

/**
 * 翻訳済みの色表示名を取得する
 *
 * @param color - カテゴリーカラー名
 * @param t - useTranslations('common') の返り値
 */
export function getColorDisplayName(
  color: CategoryColorName,
  t: ReturnType<typeof useTranslations<'common'>>,
): string {
  return t(`colors.${color}`);
}

interface CategoryColorMenuItemsProps {
  selectedColor: string;
  onColorSelect: (color: CategoryColorName) => void;
}

/**
 * カラーパレットメニューアイテム（DropdownMenu用）
 * DropdownMenuContent / DropdownMenuSubContent の中で使用
 */
export function CategoryColorMenuItems({
  selectedColor,
  onColorSelect,
}: CategoryColorMenuItemsProps) {
  const t = useTranslations('common');
  const resolvedSelected = resolveCategoryColor(selectedColor);

  return (
    <>
      {CATEGORY_COLOR_NAMES.map((colorName) => {
        const isSelected = resolvedSelected === colorName;
        const displayName = getColorDisplayName(colorName, t);

        return (
          <DropdownMenuItem
            key={colorName}
            onClick={() => onColorSelect(colorName)}
            className="hover:bg-state-hover"
          >
            <span
              className={cn('mr-2 h-4 w-4 rounded-full', CATEGORY_COLOR_MAP[colorName].dot)}
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

interface CategoryIconMenuItemsProps {
  value: string | null;
  onChange: (icon: string | null) => void;
}

/**
 * DropdownMenu 内で使うアイコン選択メニューアイテム群。
 *
 * 各アイコンを `DropdownMenuItem` でラップすることで、選択時に Radix が
 * 自動的にメニューを閉じる（CategoryColorMenuItems と同じ振る舞い）。
 */
export function CategoryIconMenuItems({ value, onChange }: CategoryIconMenuItemsProps) {
  return (
    <div className="grid grid-cols-8 gap-0">
      {CURATED_ICONS.map((iconName) => {
        const pascal = kebabToPascal(iconName);
        const LucideIcon = icons[pascal as keyof typeof icons];
        if (!LucideIcon) return null;

        const isSelected = value === iconName;

        return (
          <DropdownMenuItem
            key={iconName}
            onSelect={() => onChange(iconName)}
            className={cn(
              'flex items-center justify-center rounded-lg p-2',
              isSelected && 'ring-primary bg-state-hover ring-2',
            )}
            aria-label={iconName}
          >
            <LucideIcon className="size-5" />
          </DropdownMenuItem>
        );
      })}
    </div>
  );
}
