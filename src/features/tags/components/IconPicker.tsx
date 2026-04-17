'use client';

/**
 * IconPicker
 *
 * タグ用アイコン選択コンポーネント。
 * キュレート済みLucideアイコンをフラットグリッドで表示。
 * 先頭の「tag」アイコンがデフォルト。
 */

import { useCallback } from 'react';

import { icons } from 'lucide-react';

import { DropdownMenuItem } from '@/lib/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import { CURATED_ICONS, kebabToPascal } from '../lib/curated-icons';

interface IconPickerProps {
  /** 現在選択中のアイコン名 */
  value: string | null;
  /** アイコン選択コールバック */
  onChange: (icon: string | null) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const handleSelect = useCallback(
    (iconName: string | null) => {
      onChange(iconName);
    },
    [onChange],
  );

  return (
    <div className="space-y-2">
      {/* フラットグリッド */}
      <div className="grid grid-cols-8 gap-0">
        {CURATED_ICONS.map((iconName) => {
          const pascal = kebabToPascal(iconName);
          const LucideIcon = icons[pascal as keyof typeof icons];
          if (!LucideIcon) return null;

          const isSelected = value === iconName;

          return (
            <button
              key={iconName}
              type="button"
              onClick={() => handleSelect(iconName)}
              className={cn(
                'flex items-center justify-center rounded-lg p-2 transition-colors',
                isSelected ? 'ring-primary bg-state-hover ring-2' : 'hover:bg-state-hover',
              )}
              aria-label={iconName}
            >
              <LucideIcon className="size-5" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface IconPickerDropdownItemsProps {
  value: string | null;
  onChange: (icon: string | null) => void;
}

/**
 * DropdownMenu 内で使うアイコンピッカー。
 *
 * 各アイコンを `DropdownMenuItem` でラップすることで、選択時に Radix が
 * 自動的にメニューを閉じる（ColorPaletteMenuItems と同じ振る舞い）。
 */
export function IconPickerDropdownItems({ value, onChange }: IconPickerDropdownItemsProps) {
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
