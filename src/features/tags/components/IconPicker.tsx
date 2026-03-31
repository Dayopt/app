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

import { cn } from '@/lib/utils';

import { CURATED_ICONS, kebabToPascal } from '../lib/curated-icons';

interface IconPickerProps {
  /** 現在選択中のアイコン名 */
  value: string | null;
  /** アイコン選択コールバック */
  onChange: (icon: string | null) => void;
  /** タグ色（アイコンの着色に使用） */
  color?: string | null;
}

export function IconPicker({ value, onChange, color }: IconPickerProps) {
  const handleSelect = useCallback(
    (iconName: string | null) => {
      onChange(iconName);
    },
    [onChange],
  );

  const cssColor = color ? `var(--tag-${color})` : undefined;

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
              <LucideIcon className="size-5" style={cssColor ? { color: cssColor } : undefined} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
