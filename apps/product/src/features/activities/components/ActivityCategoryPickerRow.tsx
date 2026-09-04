'use client';

import { useTranslations } from 'next-intl';

import { cn } from '@dayopt/components';

import { getCategoryColorClasses } from '../lib/category-colors';
import type { Category } from '../types';
import { ActivityIcon } from './ActivityIcon';

interface ActivityCategoryPickerRowProps {
  categoryId: string | null;
  onChange: (categoryId: string | null) => void;
  categoryOptions: Category[];
}

/**
 * 所属カテゴリーを選ぶチップ列（#2406）。
 *
 * 「カテゴリーなし」+ 既存カテゴリーを常時インライン表示し、選ぶのに追加クリックを
 * 要らなくする。PC サイドバーの Popover とモバイルの Dialog で同じものを使う。
 */
export function ActivityCategoryPickerRow({
  categoryId,
  onChange,
  categoryOptions,
}: ActivityCategoryPickerRowProps) {
  const t = useTranslations('calendar.filter.createDialog');

  return (
    <div role="radiogroup" aria-label={t('selectCategory')} className="flex flex-wrap gap-2">
      <button
        type="button"
        role="radio"
        aria-checked={categoryId === null}
        onClick={() => onChange(null)}
        className={cn(
          'hover:bg-state-hover flex h-8 items-center gap-2 rounded-full border px-2 text-sm transition-colors',
          categoryId === null ? 'border-border bg-state-selected' : 'border-border',
        )}
      >
        {t('noCategory')}
      </button>
      {categoryOptions.map((option) => {
        const active = categoryId === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.id)}
            className={cn(
              'hover:bg-state-hover flex h-8 items-center gap-2 rounded-full border px-2 text-sm transition-colors',
              active
                ? cn(
                    getCategoryColorClasses(option.color).border,
                    getCategoryColorClasses(option.color).tint,
                  )
                : 'border-border',
            )}
          >
            <ActivityIcon icon={option.icon} color={option.color} size="sm" />
            <span className="max-w-24 truncate">{option.name}</span>
          </button>
        );
      })}
    </div>
  );
}
