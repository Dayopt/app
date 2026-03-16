'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { ActionFooter } from '@/components/ui/action-footer';
import { Button } from '@/components/ui/button';
import { Field, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useTags } from '@/features/tags';
import { useDialogKeyboard } from '@/hooks/useDialogKeyboard';
import { TAG_NAME_MAX_LENGTH } from '@/lib/tag-colors';
import { useTranslations } from 'next-intl';

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
 * Googleスタイルのシンプルなダイアログ
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
    // createPortalのレンダリング後にフォーカス＆全選択
    const timer = setTimeout(() => {
      const input = inputRef.current;
      if (input) {
        input.focus();
        input.setSelectionRange(0, input.value.length);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen, currentName]);

  // ESCキーでダイアログを閉じる
  useDialogKeyboard(isOpen, isLoading, onClose);

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

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && !isLoading) {
        onClose();
      }
    },
    [isLoading, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !isLoading) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, isLoading],
  );

  if (!isOpen) return null;

  const dialog = (
    <div
      className="z-overlay-modal fixed inset-0 flex items-center justify-center"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={t('calendar.filter.rename')}
    >
      <div
        className="animate-in zoom-in-95 fade-in bg-card text-foreground border-border rounded-2xl border p-6 shadow-lg duration-150"
        style={{ width: 'min(calc(100vw - 32px), 360px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <h2 className="mb-4 text-base font-bold">{t('calendar.filter.rename')}</h2>

        {/* Form */}
        <Field className="mb-6">
          <Input
            ref={inputRef}
            id="tag-rename-input"
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
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
