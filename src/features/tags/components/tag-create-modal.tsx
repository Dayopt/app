'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { ActionFooter } from '@/components/ui/action-footer';
import { Button } from '@/components/ui/button';
import { getColorDisplayName } from '@/components/ui/color-palette-picker';
import { Field, FieldError, FieldGroup, FieldLabel, FieldSupportText } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useHasMounted } from '@/hooks/useHasMounted';
import { useSubmitShortcut } from '@/hooks/useSubmitShortcut';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DEFAULT_TAG_ICON } from '../lib/curated-icons';
import { buildColonTagName, parseColonTag } from '../lib/tag-colon';

import {
  DEFAULT_TAG_COLOR,
  TAG_COLOR_NAMES,
  TAG_NAME_MAX_LENGTH,
  getTagColorClasses,
  resolveTagColor,
} from '@/lib/tag-colors';

import type { TagColorName } from '@/lib/tag-colors';

import type { CreateTagInput, Tag } from '../types';
import { IconPicker } from './IconPicker';
import { TagIcon } from './TagIcon';

interface TagCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CreateTagInput) => Promise<void>;
  /** デフォルトのグループ名（コロン記法のプレフィックス） */
  defaultGroup?: string | undefined;
  /** 既存タグ一覧（グループ候補算出 + 色継承用） */
  existingTags?: Tag[] | undefined;
}

/**
 * タグ作成モーダル
 *
 * グループ選択ドロップダウン付き。
 * グループを選択すると色が自動継承され、保存時にコロン記法で名前が構築される。
 */
export function TagCreateModal({
  isOpen,
  onClose,
  onSave,
  defaultGroup,
  existingTags = [],
}: TagCreateModalProps) {
  const t = useTranslations();
  const tCommon = useTranslations('common');
  const [name, setName] = useState('');
  const [color, setColor] = useState<TagColorName>(DEFAULT_TAG_COLOR);
  const [icon, setIcon] = useState<string | null>(DEFAULT_TAG_ICON);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const mounted = useHasMounted();

  // 既存タグからグループ候補を算出
  const groupOptions = useMemo(() => {
    const prefixes = new Map<string, { color: string | null; icon: string | null }>(); // prefix → { color, icon }
    for (const tag of existingTags) {
      const { prefix, suffix } = parseColonTag(tag.name);
      if (suffix !== null) {
        // コロン付きタグのプレフィックス
        if (!prefixes.has(prefix)) {
          prefixes.set(prefix, { color: tag.color, icon: tag.icon });
        }
      } else {
        // 独立タグも親候補に（ただし既にプレフィックスとして存在する場合はスキップ）
        if (!prefixes.has(tag.name)) {
          prefixes.set(tag.name, { color: tag.color, icon: tag.icon });
        }
      }
    }
    return Array.from(prefixes.entries())
      .map(([name, meta]) => ({ name, color: meta.color, icon: meta.icon }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [existingTags]);

  // グループ選択時の色自動継承
  const inheritedColor = useMemo(() => {
    if (!selectedGroup) return null;
    const group = groupOptions.find((g) => g.name === selectedGroup);
    return group?.color ?? null;
  }, [selectedGroup, groupOptions]);

  // 実際に使用する色（グループの色 or 手動選択）
  const effectiveColor = inheritedColor ? resolveTagColor(inheritedColor) : color;

  // モーダルが開いたらリセット（defaultGroupがあればプリセット）
  useEffect(() => {
    if (isOpen) {
      setName('');
      setColor(DEFAULT_TAG_COLOR);
      setIcon(DEFAULT_TAG_ICON);
      setSelectedGroup(defaultGroup ?? null);
      setError('');
    }
  }, [isOpen, defaultGroup]);

  // ESCキーでダイアログを閉じる
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  const handleSubmit = useCallback(async () => {
    setError('');

    if (!name.trim()) {
      setError(t('tags.validation.nameEmpty'));
      return;
    }

    // コロン記法で名前を構築
    const fullName = selectedGroup ? buildColonTagName(selectedGroup, name.trim()) : name.trim();

    setIsLoading(true);
    try {
      await onSave({
        name: fullName,
        color: effectiveColor,
        ...(icon ? { icon } : {}),
      });
      onClose();
    } catch (err) {
      logger.error('Tag creation failed:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes('group_conflict') || errorMessage.includes('GROUP_NAME_CONFLICT')) {
        setError(t('tags.form.groupNameConflict'));
      } else if (
        errorMessage.includes('duplicate') ||
        errorMessage.includes('unique') ||
        errorMessage.includes('already exists') ||
        errorMessage.includes('重複') ||
        errorMessage.includes('既に存在')
      ) {
        setError(t('tags.form.duplicateName'));
      } else {
        setError(t('tags.errors.createFailed'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [name, selectedGroup, effectiveColor, icon, onSave, onClose, t]);

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
      if (e.key === 'Enter' && !isLoading && name.trim()) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, isLoading, name],
  );

  // Cmd+Enter / Ctrl+Enter で作成
  useSubmitShortcut({
    enabled: isOpen,
    isLoading,
    checkDisabled: () => !name.trim(),
    onSubmit: handleSubmit,
  });

  if (!mounted || !isOpen) return null;

  const dialog = (
    <div
      className="z-overlay-modal fixed inset-0 flex items-center justify-center"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tag-create-dialog-title"
    >
      <div
        className="animate-in zoom-in-95 fade-in bg-card text-foreground border-border-subtle shadow-card rounded-2xl border p-6 duration-150"
        style={{ width: 'min(calc(100vw - 32px), 400px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <h2 id="tag-create-dialog-title" className="mb-6 text-lg font-bold">
          {t('tags.modal.createTitle')}
        </h2>

        {/* Form */}
        <FieldGroup className="mb-6">
          {/* タグ名 */}
          <Field>
            <FieldLabel htmlFor="tag-name" required requiredLabel={t('common.form.required')}>
              {t('tags.form.tagName')}
            </FieldLabel>
            <div className="flex items-center justify-between">
              <FieldSupportText id="tag-name-support">
                {t('tags.form.examplePlaceholder')}
              </FieldSupportText>
              <span className="text-muted-foreground text-xs tabular-nums">
                {name.length}/{TAG_NAME_MAX_LENGTH}
              </span>
            </div>
            <Input
              id="tag-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              onKeyDown={handleKeyDown}
              maxLength={TAG_NAME_MAX_LENGTH}
              aria-invalid={!!error}
              aria-describedby={error ? 'tag-name-error tag-name-support' : 'tag-name-support'}
              autoFocus
            />
            {error && (
              <FieldError id="tag-name-error" announceImmediately>
                {error}
              </FieldError>
            )}
            {name.length >= TAG_NAME_MAX_LENGTH && (
              <FieldError noPrefix>{t('common.validation.limitReached')}</FieldError>
            )}
          </Field>

          {/* カラー（グループ選択時は非表示 — 色は自動継承） */}
          {!inheritedColor && (
            <Field>
              <FieldLabel>{t('tags.form.color')}</FieldLabel>
              <div className="grid grid-cols-5 gap-2">
                {TAG_COLOR_NAMES.map((c) => {
                  const classes = getTagColorClasses(c);
                  const isActive = color === c;
                  const displayName = getColorDisplayName(c, tCommon);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className="flex flex-col items-center gap-1"
                      aria-label={displayName}
                      aria-pressed={isActive}
                    >
                      <span
                        className={cn(
                          'flex size-9 items-center justify-center rounded-full transition-all',
                          isActive ? 'ring-primary ring-2 ring-offset-2' : 'hover:scale-110',
                          classes.dot,
                        )}
                      >
                        {isActive && <Check className="size-4 text-white" />}
                      </span>
                      <span className="text-muted-foreground text-xs">{displayName}</span>
                    </button>
                  );
                })}
              </div>
            </Field>
          )}

          {/* アイコン（グループ選択時は非表示） */}
          {!inheritedColor && (
            <Field>
              <FieldLabel>{t('tags.labels.selectIcon')}</FieldLabel>
              <IconPicker value={icon} onChange={setIcon} color={effectiveColor} />
            </Field>
          )}

          {/* グループ選択 */}
          {groupOptions.length > 0 && (
            <Field>
              <FieldLabel>{t('tags.form.group')}</FieldLabel>
              <FieldSupportText>{t('tags.form.groupSupportText')}</FieldSupportText>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedGroup(null)}
                  className={cn(
                    'rounded-full border px-2 py-1 text-sm transition-colors',
                    !selectedGroup
                      ? 'border-primary bg-primary-state-selected text-foreground'
                      : 'border-border hover:bg-state-hover text-muted-foreground',
                  )}
                >
                  {t('tags.form.noGroup')}
                </button>
                {groupOptions.map((group) => (
                  <button
                    key={group.name}
                    type="button"
                    onClick={() => setSelectedGroup(group.name)}
                    className={cn(
                      'flex items-center gap-1 rounded-full border px-2 py-1 text-sm transition-colors',
                      selectedGroup === group.name
                        ? 'border-primary bg-primary-state-selected text-foreground'
                        : 'border-border hover:bg-state-hover text-muted-foreground',
                    )}
                  >
                    <TagIcon icon={group.icon} color={group.color} size="sm" className="shrink-0" />
                    {group.name}
                  </button>
                ))}
              </div>
            </Field>
          )}
        </FieldGroup>

        {/* Footer */}
        <ActionFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="hover:bg-state-hover"
          >
            {t('common.actions.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? t('common.actions.creating') : t('common.actions.create')}
          </Button>
        </ActionFooter>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
