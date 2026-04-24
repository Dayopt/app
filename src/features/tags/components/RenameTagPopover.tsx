'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Button } from '@/lib/components/ui/button';
import { FieldError } from '@/lib/components/ui/field';
import { Input } from '@/lib/components/ui/input';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/lib/components/ui/popover';
import { TAG_NAME_MAX_LENGTH } from '@/lib/tag-colors';

import type { Tag } from '../types';

export interface RenameTagPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** リネーム対象タグ（name 初期値 + 親コンテキスト + 重複除外に使用） */
  tag: Tag;
  /** 重複チェック用の既存タグ一覧 */
  existingTags: Tag[];
  /** 保存。成功時に呼び出し側が close する */
  onSubmit: (name: string) => void | Promise<void>;
  /**
   * PopoverTrigger として使う要素。省略時は anchor モード（親を `relative` にして使用）。
   */
  children?: React.ReactNode;
}

/**
 * タグ名リネーム Popover。
 *
 * - 名前のみ編集（色 / アイコン / グループは本 Popover の対象外）
 * - 同一親内で重複不可（200ms debounce、自身は除外）
 * - Enter 送信 / Esc で close
 */
export function RenameTagPopover({
  open,
  onOpenChange,
  tag,
  existingTags,
  onSubmit,
  children,
}: RenameTagPopoverProps) {
  const t = useTranslations('calendar.filter.renamePopover');
  const tCommon = useTranslations('common');

  const [name, setName] = useState(tag.name);
  const [debouncedName, setDebouncedName] = useState(tag.name);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(tag.name);
    setDebouncedName(tag.name);
    setSubmitting(false);
  }, [open, tag.name]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedName(name), 200);
    return () => clearTimeout(id);
  }, [name]);

  const trimmedDebounced = debouncedName.trim();

  const duplicate = useMemo(() => {
    if (!trimmedDebounced) return false;
    const lower = trimmedDebounced.toLowerCase();
    return existingTags.some(
      (other) =>
        other.id !== tag.id &&
        other.parent_id === tag.parent_id &&
        other.name.toLowerCase() === lower,
    );
  }, [existingTags, tag.id, tag.parent_id, trimmedDebounced]);

  const trimmedLive = name.trim();
  const unchanged = trimmedLive === tag.name;
  const canSubmit = trimmedLive.length > 0 && !duplicate && !unchanged && !submitting;

  const errorMessage = duplicate ? t('duplicateName') : null;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmedLive);
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, trimmedLive, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!canSubmit) return;
        void handleSubmit();
      }
    },
    [canSubmit, handleSubmit],
  );

  const formBody = (
    <div className="flex flex-col gap-3">
      <div className="text-foreground text-sm font-medium">{t('title')}</div>

      <div className="flex flex-col gap-1">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('namePlaceholder')}
          aria-label={t('name')}
          aria-invalid={duplicate || undefined}
          maxLength={TAG_NAME_MAX_LENGTH}
          disabled={submitting}
        />
        {errorMessage ? <FieldError announceImmediately>{errorMessage}</FieldError> : null}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
          {tCommon('actions.cancel')}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          loading={submitting}
        >
          {tCommon('actions.save')}
        </Button>
      </div>
    </div>
  );

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {children ? (
        <PopoverTrigger asChild>{children}</PopoverTrigger>
      ) : (
        <PopoverAnchor aria-hidden className="pointer-events-none absolute inset-0" />
      )}
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        collisionPadding={16}
        className="w-72 p-3"
      >
        {formBody}
      </PopoverContent>
    </Popover>
  );
}
