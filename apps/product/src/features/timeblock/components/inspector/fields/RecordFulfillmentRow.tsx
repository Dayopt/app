'use client';

/**
 * 充実度インライン行（Record 専用、#2317）
 *
 * icon + label（左）、3つのトグルアイコン（右）。
 * ワンクリックで選択、もう一回クリックで解除（既定は未入力）。
 * Plan には無い概念なので、TimeblockInspectorForm は kind === 'record' の時だけ描画する。
 */

import { useCallback } from 'react';

import { Frown, Meh, Smile } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn, HoverTooltip } from '@dayopt/components';

import type { Fulfillment } from '../../../schemas/timeblock';

const FULFILLMENT_OPTIONS: { value: Fulfillment; icon: typeof Smile }[] = [
  { value: 'low', icon: Frown },
  { value: 'medium', icon: Meh },
  { value: 'high', icon: Smile },
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
        {FULFILLMENT_OPTIONS.map(({ value: option, icon: Icon }) => {
          const isSelected = value === option;
          return (
            <HoverTooltip key={option} content={t(`options.${option}`)} side="bottom">
              <button
                type="button"
                disabled={disabled}
                onClick={() => handleToggle(option)}
                aria-label={t(`options.${option}`)}
                aria-pressed={isSelected}
                className={cn(
                  'flex size-10 items-center justify-center rounded-lg transition-colors',
                  'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                  'disabled:pointer-events-none disabled:opacity-50',
                  isSelected
                    ? 'bg-state-selected text-foreground'
                    : 'text-muted-foreground hover:bg-state-hover hover:text-foreground',
                )}
              >
                <Icon className="size-5" />
              </button>
            </HoverTooltip>
          );
        })}
      </div>
    </div>
  );
}
