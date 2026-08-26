'use client';

/**
 * CategoryAppearanceMenuItems
 *
 * カテゴリーの色・アイコンを選択する DropdownMenu 用アイテム群。
 * 色・アイコンを持つのはカテゴリーだけ（アクティビティは所属カテゴリーの色を
 * 継承する）という新モデルの前提に立ち、DropdownMenuContent /
 * DropdownMenuSubContent の中で使う named export を提供する:
 *
 * - `CategoryColorMenuItems` — カラーパレット選択（旧 tags の ColorPaletteMenuItems）
 * - `CategoryIconMenuItems` — アイコン選択（旧 tags の IconPickerDropdownItems）
 * - `CategoryAppearancePickerRow` — 上記 2 つをまとめた作成フォーム用の属性行（#2406）
 */

import { Check, icons } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@dayopt/components';
import {
  CATEGORY_COLOR_MAP,
  CATEGORY_COLOR_NAMES,
  resolveCategoryColor,
} from '../lib/category-colors';
import { CURATED_ICONS, kebabToPascal } from '../lib/curated-icons';
import { ActivityIcon } from './ActivityIcon';

import type { CategoryColorName } from '../lib/category-colors';

/**
 * 翻訳済みの色表示名を取得する
 *
 * @param color - カテゴリーカラー名
 * @param t - useTranslations('common') の返り値
 */
function getColorDisplayName(
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

interface CategoryAppearancePickerRowProps {
  /** null は「未選択（既定の自動割当に従う）」を表す */
  color: CategoryColorName | null;
  onColorChange: (color: CategoryColorName) => void;
  /** null は「未選択（既定アイコンにフォールバック）」を表す */
  icon: string | null;
  onIconChange: (icon: string | null) => void;
}

/**
 * カテゴリー作成フォーム用の属性行（色 + アイコン）。
 *
 * 各ボタンは現在値をプレビューし、押すと `CategoryColorMenuItems` /
 * `CategoryIconMenuItems` を DropdownMenu で開いて選ばせる。旧タグ作成 UI
 * （削除済み `TagCreateModal`）の属性行と同じ操作感を、新規 picker を書かずに
 * 既存部品の組み合わせだけで再現する（#2406）。
 */
export function CategoryAppearancePickerRow({
  color,
  onColorChange,
  icon,
  onIconChange,
}: CategoryAppearancePickerRowProps) {
  const t = useTranslations('calendar.filter.createDialog');
  const resolvedColor = resolveCategoryColor(color);

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t('selectColor')}
            className="border-border hover:bg-state-hover active:bg-state-hover focus-visible:outline-ring flex size-8 items-center justify-center rounded-lg border transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <span
              className={cn('size-3.5 rounded-full', CATEGORY_COLOR_MAP[resolvedColor].dot)}
              aria-hidden
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <CategoryColorMenuItems selectedColor={resolvedColor} onColorSelect={onColorChange} />
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t('selectIcon')}
            className="border-border hover:bg-state-hover active:bg-state-hover focus-visible:outline-ring flex size-8 items-center justify-center rounded-lg border transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <ActivityIcon icon={icon} color={color} size="sm" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto p-2">
          <CategoryIconMenuItems value={icon} onChange={onIconChange} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
