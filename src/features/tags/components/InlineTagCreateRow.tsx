'use client';

import { useCallback, useRef, useState } from 'react';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { FieldError } from '@/lib/components/ui/field';
import { Input } from '@/lib/components/ui/input';
import {
  DEFAULT_TAG_COLOR,
  TAG_COLOR_NAMES,
  TAG_NAME_MAX_LENGTH,
  getTagColorClasses,
} from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

import { DEFAULT_TAG_ICON } from '../lib/curated-icons';
import { buildColonTagName, hasGroupNameConflict } from '../lib/tag-colon';
import { TagIcon } from './TagIcon';

import type { TagColorName } from '@/lib/tag-colors';
import type { Tag } from '../types';

export interface InlineTagCreateRowProps {
  /** 固定 group（prefix）— GroupHeader 内作成時に渡す */
  defaultGroup?: string | null | undefined;
  /** 色スウォッチの初期選択値。省略時は DEFAULT_TAG_COLOR */
  defaultColor?: TagColorName | null | undefined;
  /** 重複チェック用 */
  existingTags: Tag[];
  onSubmit: (name: string, color: TagColorName) => void | Promise<void>;
  onCancel: () => void;
  /** 外形: badge=pill list 内、row=sidebar list 内 */
  variant?: 'badge' | 'row';
}

/**
 * インラインタグ作成フォーム
 *
 * - name 入力 + 色スウォッチ（`defaultColor` 指定時は初期選択値として使う）
 * - Enter: 送信 / Esc: キャンセル / outside blur: キャンセル
 * - アイコンは DEFAULT_TAG_ICON 固定。作成後に filter menu から変更する運用
 */
export function InlineTagCreateRow({
  defaultGroup,
  defaultColor,
  existingTags,
  onSubmit,
  onCancel,
  variant = 'row',
}: InlineTagCreateRowProps) {
  const tCalendar = useTranslations('calendar');
  const tTags = useTranslations('tags');
  const tCommon = useTranslations('common');

  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState<TagColorName>(
    defaultColor ?? DEFAULT_TAG_COLOR,
  );
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError(tTags('validation.nameEmpty'));
      return;
    }

    const combined = defaultGroup ? buildColonTagName(defaultGroup, trimmed) : trimmed;

    const duplicate = existingTags.some((tag) => tag.name.toLowerCase() === combined.toLowerCase());
    if (duplicate) {
      setError(tTags('form.duplicateName'));
      return;
    }

    if (hasGroupNameConflict(combined, existingTags)) {
      setError(tTags('form.groupNameConflict'));
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(combined, selectedColor);
    } finally {
      setSubmitting(false);
    }
  }, [submitting, name, defaultGroup, existingTags, onSubmit, selectedColor, tTags]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void handleSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    },
    [handleSubmit, onCancel],
  );

  /** コンテナ外にフォーカスが移ったらキャンセル扱い */
  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      const next = e.relatedTarget as Node | null;
      if (next && containerRef.current?.contains(next)) return;
      onCancel();
    },
    [onCancel],
  );

  return (
    <div
      ref={containerRef}
      onBlur={handleBlur}
      className={cn(
        'border-border bg-card flex flex-col gap-2 border p-2',
        variant === 'badge' ? 'rounded-2xl' : 'rounded-lg',
        'w-full',
      )}
    >
      <div className="flex items-center gap-2">
        <TagIcon icon={DEFAULT_TAG_ICON} color={selectedColor} size="sm" />
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError('');
          }}
          onKeyDown={handleKeyDown}
          placeholder={tCalendar('tagSelector.createPlaceholder')}
          aria-label={tCalendar('tagSelector.new')}
          maxLength={TAG_NAME_MAX_LENGTH}
          disabled={submitting}
          autoFocus
          className="h-8 flex-1"
        />
      </div>

      <div
        role="radiogroup"
        aria-label={tCalendar('tagSelector.color')}
        className="flex flex-wrap gap-1"
      >
        {TAG_COLOR_NAMES.map((color) => {
          const classes = getTagColorClasses(color);
          const isActive = selectedColor === color;
          return (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={color}
              onClick={() => setSelectedColor(color)}
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full transition-all',
                isActive ? 'ring-primary ring-2 ring-offset-2' : 'hover:scale-110 active:scale-95',
                classes.dot,
              )}
            >
              {isActive && <Check className="size-4 text-white" />}
            </button>
          );
        })}
      </div>

      {error && <FieldError announceImmediately>{error}</FieldError>}

      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span className="tabular-nums">
          {name.length}/{TAG_NAME_MAX_LENGTH}
        </span>
        <span>
          {tCommon('actions.create')}: ⏎ / {tCommon('actions.cancel')}: Esc
        </span>
      </div>
    </div>
  );
}
