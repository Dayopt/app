'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useTranslations } from 'next-intl';

import { FieldError } from '@/lib/components/ui/field';
import { Input } from '@/lib/components/ui/input';
import { TAG_NAME_MAX_LENGTH } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

export interface InlineTagNameEditProps {
  /** 表示用の現在値（グループ内タグなら suffix のみ） */
  value: string;
  /** Enter / blur でのセーブ。成功/失敗に関わらず onDoneEditing で閉じる */
  onSave: (next: string) => void | Promise<void>;
  /** 重複チェック用 — 表示名と同階層の既存名一覧（自分自身を除外済みで渡す） */
  existingNames: string[];
  /** 編集モードのとき true */
  editing: boolean;
  /** 編集モード終了通知（Enter 成功 / Esc / blur で呼ばれる） */
  onDoneEditing: () => void;
  /** 非編集時の表示要素 className */
  className?: string;
  /** aria-label（input / span 共通） */
  ariaLabel?: string;
}

/**
 * インライン名前編集
 *
 * - editing=false → 普通の `<span>` で value を表示
 * - editing=true  → `<Input>` を描画、Enter/blur で onSave、Esc で破棄
 * - 重複エラー時は下に 1 行 FieldError
 * - 変更が無い場合は保存せず閉じる
 */
export function InlineTagNameEdit({
  value,
  onSave,
  existingNames,
  editing,
  onDoneEditing,
  className,
  ariaLabel,
}: InlineTagNameEditProps) {
  const tTags = useTranslations('tags');
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');

  // editing 開始時に現在値でリセット（React推奨の「propの変化に応じてstateを同期する」パターン）
  const [prevEditing, setPrevEditing] = useState(editing);
  if (editing !== prevEditing) {
    setPrevEditing(editing);
    if (editing) {
      setDraft(value);
      setError('');
    }
  }

  // editing 開始時に cancelled フラグをリセットして input をフォーカス＆全選択
  useEffect(() => {
    if (!editing) return;
    cancelledRef.current = false;
    const id = requestAnimationFrame(() => {
      const input = inputRef.current;
      if (input) {
        input.focus();
        input.setSelectionRange(0, input.value.length);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [editing]);

  const commit = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        setError(tTags('validation.nameEmpty'));
        return false;
      }
      if (trimmed === value) {
        return true; // 変更なし — そのまま閉じる
      }
      const duplicate = existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase());
      if (duplicate) {
        setError(tTags('form.duplicateName'));
        return false;
      }
      try {
        await onSave(trimmed);
        return true;
      } catch {
        setError(tTags('errors.updateFailed'));
        return false;
      }
    },
    [existingNames, onSave, value, tTags],
  );

  const handleKeyDown = useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const ok = await commit(draft);
        if (ok) {
          cancelledRef.current = false;
          onDoneEditing();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelledRef.current = true;
        setError('');
        onDoneEditing();
      }
    },
    [commit, draft, onDoneEditing],
  );

  const handleBlur = useCallback(async () => {
    if (cancelledRef.current) return;
    const ok = await commit(draft);
    if (ok) {
      onDoneEditing();
    } else {
      // エラーのままだと blur で消せないので、エラー表示だけ残して編集継続
      // （ユーザーが Esc で破棄 or 修正して Enter で再送信できる）
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [commit, draft, onDoneEditing]);

  if (!editing) {
    return (
      <span className={cn('min-w-0 truncate', className)} aria-label={ariaLabel}>
        {value}
      </span>
    );
  }

  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (error) setError('');
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        maxLength={TAG_NAME_MAX_LENGTH}
        aria-label={ariaLabel}
        aria-invalid={!!error}
        className="h-7"
      />
      {error && <FieldError announceImmediately>{error}</FieldError>}
    </span>
  );
}
