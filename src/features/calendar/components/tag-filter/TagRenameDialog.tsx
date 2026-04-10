'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useTranslations } from 'next-intl';

import { ActionFooter } from '@/components/ui/action-footer';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useTags } from '@/features/tags';
import { TAG_NAME_MAX_LENGTH } from '@/lib/tag-colors';

interface TagRenameDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
  /** 現在のタグ名 */
  currentName: string;
  /** 現在のタグID（重複チェックで自分自身を除外するため） */
  tagId: string;
}

/**
 * タグ名変更ダイアログ
 *
 * Radix Dialog ベース（フォーカストラップ・ESCキー処理を自動管理）
 * - 入力フィールド1つ
 * - キャンセル/OKボタン
 * - Enter で保存、Esc でキャンセル
 */
export function TagRenameDialog({
  isOpen,
  onClose,
  onSave,
  currentName,
  tagId,
}: TagRenameDialogProps) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // 既存タグ一覧を取得（重複チェック用）
  const { data: existingTags } = useTags();

  // モーダルが開いたら現在の名前をセット＆フォーカス
  useEffect(() => {
    if (!isOpen) return;

    setName(currentName);
    setError('');
    // Radix Dialog のレンダリング後にフォーカス＆全選択
    const timer = setTimeout(() => {
      const input = inputRef.current;
      if (input) {
        input.focus();
        input.setSelectionRange(0, input.value.length);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen, currentName]);

  const handleSubmit = useCallback(async () => {
    const trimmedName = name.trim();
    setError('');

    if (!trimmedName) {
      setError(t('tags.validation.nameEmpty'));
      return;
    }

    // 変更がない場合は閉じるだけ
    if (trimmedName === currentName) {
      onClose();
      return;
    }

    // クライアント側で重複チェック（自分自身は除外、大文字小文字を区別しない）
    const isDuplicateClient = existingTags?.some(
      (tag) => tag.id !== tagId && tag.name.toLowerCase() === trimmedName.toLowerCase(),
    );
    if (isDuplicateClient) {
      setError(t('tags.form.duplicateName'));
      return;
    }

    setIsLoading(true);
    try {
      await onSave(trimmedName);
      onClose();
    } catch (err) {
      // TRPCError / TanStack Query error の各種形式に対応
      const errorMessage = err instanceof Error ? err.message : String(err);

      // 型安全なエラーコード抽出
      interface TRPCErrorShape {
        data?: { code?: string };
        code?: string;
        cause?: { code?: string; message?: string };
      }
      const trpcErr = err as Error & Partial<TRPCErrorShape>;
      const errorCode = trpcErr.data?.code ?? trpcErr.code ?? trpcErr.cause?.code ?? '';
      const causeMessage = trpcErr.cause?.message ?? '';

      const isDuplicate =
        errorCode === 'DUPLICATE_NAME' ||
        errorMessage.includes('duplicate') ||
        errorMessage.includes('unique') ||
        errorMessage.includes('already exists') ||
        errorMessage.includes('DUPLICATE_NAME') ||
        causeMessage.includes('already exists') ||
        causeMessage.includes('DUPLICATE_NAME') ||
        errorMessage.includes('重複') ||
        errorMessage.includes('既に存在');

      if (isDuplicate) {
        setError(t('tags.form.duplicateName'));
      } else {
        setError(t('tags.errors.updateFailed'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [name, currentName, existingTags, tagId, onSave, onClose, t]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !isLoading) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, isLoading],
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && !isLoading) {
        onClose();
      }
    },
    [isLoading, onClose],
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-90">
        {/* Header */}
        <DialogTitle className="text-base">{t('calendar.filter.rename')}</DialogTitle>
        <DialogDescription className="sr-only">{t('calendar.filter.rename')}</DialogDescription>

        {/* Form */}
        <Field>
          <Input
            ref={inputRef}
            id="tag-rename-input"
            aria-label={t('calendar.filter.rename')}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError('');
            }}
            onKeyDown={handleKeyDown}
            maxLength={TAG_NAME_MAX_LENGTH}
            aria-invalid={!!error}
            aria-describedby={error ? 'tag-rename-error' : undefined}
          />
          <div className="mt-1 flex items-start justify-between gap-2">
            <div className="min-h-5 flex-1">
              {error && (
                <FieldError id="tag-rename-error" announceImmediately>
                  {error}
                </FieldError>
              )}
              {name.length >= TAG_NAME_MAX_LENGTH && (
                <FieldError noPrefix>{t('common.validation.limitReached')}</FieldError>
              )}
            </div>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {name.length}/{TAG_NAME_MAX_LENGTH}
            </span>
          </div>
        </Field>

        {/* Footer */}
        <ActionFooter>
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>
            {t('common.actions.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? '...' : 'OK'}
          </Button>
        </ActionFooter>
      </DialogContent>
    </Dialog>
  );
}
