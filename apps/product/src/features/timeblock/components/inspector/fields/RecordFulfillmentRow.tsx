'use client';

/**
 * 充実度インライン行（Record 専用、#2317）
 *
 * icon + label（左）、3つのトグルテキストボタン（右、User指示で#2412のicon版から変更）。
 * ワンクリックで選択、もう一回クリックで解除（既定は未入力）。
 * Plan には無い概念なので、TimeblockInspectorForm は kind === 'record' の時だけ描画する。
 */

import { useCallback } from 'react';

import { Smile } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@dayopt/components';

import type { Fulfillment } from '../../../schemas/timeblock';

const FULFILLMENT_OPTIONS: { value: Fulfillment }[] = [
  { value: 'low' },
  { value: 'medium' },
  { value: 'high' },
];

interface RecordFulfillmentRowProps {
  value: Fulfillment | null;
  onChange: (value: Fulfillment | null) => void;
  disabled?: boolean;
}

/** Inspector の充実度入力行（3 段階トグルアイコン、再クリックで解除） */
export function RecordFulfillmentRow({
  value,
  onChange,
  disabled = false,
}: RecordFulfillmentRowProps) {
  const t = useTranslations('timeblock.editor.fulfillment');

  const handleToggle = useCallback(
    (next: Fulfillment) => {
      onChange(value === next ? null : next);
    },
    [value, onChange],
  );

  return (
    <div className="flex min-h-11 items-center justify-between">
      <div className="flex items-center gap-2">
        <Smile className="text-muted-foreground size-4 flex-shrink-0" />
        <span className="text-muted-foreground text-sm">{t('label')}</span>
      </div>
      <div className="flex items-center gap-1">
        {FULFILLMENT_OPTIONS.map(({ value: option }) => {
          const isSelected = value === option;
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              onClick={() => handleToggle(option)}
              aria-pressed={isSelected}
              className={cn(
                'border-border rounded-lg border px-2 py-1 text-sm font-medium transition-colors',
                'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                'disabled:pointer-events-none disabled:opacity-50',
                isSelected
                  ? 'bg-state-selected text-foreground'
                  : 'text-muted-foreground hover:bg-state-hover hover:text-foreground',
              )}
            >
              {t(`options.${option}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
