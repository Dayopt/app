'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { ActionFooter } from '@/components/ui/action-footer';
import { Button } from '@/components/ui/button';
import { COLOR_DISPLAY_NAMES, ColorPaletteMenuItems } from '@/components/ui/color-palette-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldError, FieldGroup, FieldLabel, FieldSupportText } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useHasMounted } from '@/hooks/useHasMounted';
import { useSubmitShortcut } from '@/hooks/useSubmitShortcut';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { buildColonTagName, parseColonTag } from '../lib/tag-colon';

import {
  DEFAULT_TAG_COLOR,
  TAG_COLOR_MAP,
  TAG_NAME_MAX_LENGTH,
  getTagColorClasses,
  resolveTagColor,
} from '@/lib/tag-colors';

import type { TagColorName } from '@/lib/tag-colors';

import type { CreateTagInput, Tag } from '../types';

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
  const [name, setName] = useState('');
  const [color, setColor] = useState<TagColorName>(DEFAULT_TAG_COLOR);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isGroupDropdownOpen, setIsGroupDropdownOpen] = useState(false);
  const mounted = useHasMounted();

  // 既存タグからグループ候補を算出
  const groupOptions = useMemo(() => {
    const prefixes = new Map<string, string | null>(); // prefix → color
    for (const tag of existingTags) {
      const { prefix, suffix } = parseColonTag(tag.name);
      if (suffix !== null) {
        // コロン付きタグのプレフィックス
        if (!prefixes.has(prefix)) {
          prefixes.set(prefix, tag.color);
        }
      } else {
        // 独立タグも親候補に（ただし既にプレフィックスとして存在する場合はスキップ）
        if (!prefixes.has(tag.name)) {
          prefixes.set(tag.name, tag.color);
        }
      }
    }
    return Array.from(prefixes.entries())
      .map(([name, groupColor]) => ({ name, color: groupColor }))
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
      setSelectedGroup(defaultGroup ?? null);
      setError('');
      setIsGroupDropdownOpen(false);
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

  // グループドロップダウン外クリックで閉じる
  useEffect(() => {
    if (!isGroupDropdownOpen) return;

    const handleClickOutside = () => {
      setIsGroupDropdownOpen(false);
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isGroupDropdownOpen]);

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
  }, [name, selectedGroup, effectiveColor, onSave, onClose, t]);

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

  const selectedGroupOption = groupOptions.find((g) => g.name === selectedGroup);

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
        className="animate-in zoom-in-95 fade-in bg-card text-foreground border-border rounded-2xl border p-6 shadow-lg duration-150"
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="border-border bg-container hover:bg-state-hover flex h-9 w-full items-center gap-2 rounded-lg border px-4 text-sm"
                  >
                    <span
                      className={cn('size-4 rounded-full', TAG_COLOR_MAP[color].dot)}
                      aria-hidden
                    />
                    <span>{COLOR_DISPLAY_NAMES[color] || color}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <ColorPaletteMenuItems
                    selectedColor={color}
                    onColorSelect={(c) => setColor(c as TagColorName)}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </Field>
          )}

          {/* グループ選択 */}
          {groupOptions.length > 0 && (
            <Field>
              <FieldLabel>{t('tags.form.group')}</FieldLabel>
              <FieldSupportText>{t('tags.form.groupSupportText')}</FieldSupportText>
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsGroupDropdownOpen(!isGroupDropdownOpen);
                  }}
                  className="border-border bg-container hover:bg-state-hover flex h-9 w-full items-center justify-between rounded-lg border px-4 text-sm"
                >
                  <span
                    className={selectedGroupOption ? 'text-foreground' : 'text-muted-foreground'}
                  >
                    {selectedGroupOption ? selectedGroupOption.name : t('tags.form.noGroup')}
                  </span>
                  <ChevronDown className="text-muted-foreground size-4" />
                </button>

                {isGroupDropdownOpen && (
                  <div className="bg-card border-border absolute top-full z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border py-1 shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedGroup(null);
                        setIsGroupDropdownOpen(false);
                      }}
                      className="hover:bg-state-hover w-full px-4 py-2 text-left text-sm"
                    >
                      {t('tags.form.noGroup')}
                    </button>
                    {groupOptions.map((group) => (
                      <button
                        key={group.name}
                        type="button"
                        onClick={() => {
                          setSelectedGroup(group.name);
                          setIsGroupDropdownOpen(false);
                        }}
                        className="hover:bg-state-hover flex w-full items-center gap-2 px-4 py-2 text-left text-sm"
                      >
                        <span
                          className={cn(
                            'size-3 shrink-0 rounded-full',
                            getTagColorClasses(group.color).dot,
                          )}
                          aria-hidden
                        />
                        {group.name}
                      </button>
                    ))}
                  </div>
                )}
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
