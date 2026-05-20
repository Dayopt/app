'use client';

/**
 * タグ新規作成モーダル
 *
 * `useShellStore.activeSheet` で管理され、どこからでも
 * `useShellStore.use.openTagCreateModal()` で開ける。
 * 色 / アイコン / グループ / 名前を 1 画面で指定して作成する。
 *
 * Dialog の responsive='auto' に依存し、PC=Dialog / モバイル=Drawer に自動切替。
 * vaul drawer の nest 問題を避けるため、別 Drawer (例: TagQuickSelector mobile) の
 * 中から呼ぶ場合は **caller 側で先に自身を閉じてから** open すること。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Folder, icons as lucideIcons } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/lib/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/lib/components/ui/dialog';
import { FieldError } from '@/lib/components/ui/field';
import { Input } from '@/lib/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/lib/components/ui/popover';
import {
  DEFAULT_TAG_COLOR,
  TAG_COLOR_MAP,
  TAG_COLOR_NAMES,
  TAG_NAME_MAX_LENGTH,
  resolveTagColor,
} from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

import { useCreateTag } from '../hooks/useTagCrudMutations';
import { useTags } from '../hooks/useTagsQuery';
import { CURATED_ICONS, DEFAULT_TAG_ICON, kebabToPascal } from '../lib/curated-icons';
import { TagIcon } from './TagIcon';

import type { CreatedTagPayload } from '@/lib/stores/useShellStore';
import type { TagColorName } from '@/lib/tag-colors';
import type { Tag } from '../types';

interface GroupOption {
  id: string;
  name: string;
  color: TagColorName;
  icon: string | null;
}

interface TagCreateModalProps {
  open: boolean;
  onClose: () => void;
  initialParentId?: string | null;
  /** 作成成功時に呼ばれる。selection 反映等に使う */
  onCreated?: (tag: CreatedTagPayload) => void;
}

export function TagCreateModal({ open, onClose, initialParentId, onCreated }: TagCreateModalProps) {
  const t = useTranslations('calendar.filter.createDialog');
  const tCommon = useTranslations('common');

  const { data: existingTags } = useTags();
  const createTagMutation = useCreateTag();

  const [name, setName] = useState('');
  const [debouncedName, setDebouncedName] = useState('');
  const [color, setColor] = useState<TagColorName>(DEFAULT_TAG_COLOR);
  const [icon, setIcon] = useState<string | null>(null);
  const [parentId, setParentId] = useState<string | null>(initialParentId ?? null);
  const [submitting, setSubmitting] = useState(false);

  const [colorPopoverOpen, setColorPopoverOpen] = useState(false);
  const [iconPopoverOpen, setIconPopoverOpen] = useState(false);
  const [groupPopoverOpen, setGroupPopoverOpen] = useState(false);

  // モーダル open 時に初期値を同期
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setName('');
      setDebouncedName('');
      setColor(DEFAULT_TAG_COLOR);
      setIcon(null);
      setParentId(initialParentId ?? null);
      setSubmitting(false);
      setColorPopoverOpen(false);
      setIconPopoverOpen(false);
      setGroupPopoverOpen(false);
    });
  }, [open, initialParentId]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedName(name), 200);
    return () => clearTimeout(id);
  }, [name]);

  const allTags = useMemo<Tag[]>(() => existingTags ?? [], [existingTags]);

  const groupOptions = useMemo<GroupOption[]>(() => {
    return allTags
      .filter((tag) => tag.parent_id === null && tag.is_active !== false)
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((tag) => ({
        id: tag.id,
        name: tag.name,
        color: resolveTagColor(tag.color),
        icon: tag.icon ?? null,
      }));
  }, [allTags]);

  const selectedGroupOption = useMemo<GroupOption | null>(
    () => groupOptions.find((option) => option.id === parentId) ?? null,
    [groupOptions, parentId],
  );

  const trimmedDebounced = debouncedName.trim();
  const trimmedLive = name.trim();

  const checkDuplicate = useCallback(
    (value: string) => {
      if (!value) return false;
      const lower = value.toLowerCase();
      return allTags.some(
        (tag) =>
          tag.is_active !== false && tag.parent_id === parentId && tag.name.toLowerCase() === lower,
      );
    },
    [allTags, parentId],
  );

  const duplicate = useMemo(
    () => checkDuplicate(trimmedDebounced),
    [checkDuplicate, trimmedDebounced],
  );

  const canSubmit = trimmedLive.length > 0 && !duplicate && !submitting;

  const errorMessage = duplicate ? t('duplicateName') : null;

  const handleSubmit = useCallback(async () => {
    if (submitting || trimmedLive.length === 0) return;
    // debounce (200ms) より早く submit された場合に備え、live name で同期再チェック
    if (checkDuplicate(trimmedLive)) {
      setDebouncedName(trimmedLive);
      return;
    }
    setSubmitting(true);
    try {
      const created = await createTagMutation.mutateAsync({
        name: trimmedLive,
        color,
        ...(icon ? { icon } : {}),
        ...(parentId ? { parentId } : {}),
      });
      onCreated?.({
        id: created.id,
        name: created.name,
        color: created.color,
        icon: created.icon,
        parent_id: created.parent_id,
      });
      onClose();
    } catch {
      // mutation hook 側で toast 済み。閉じない
    } finally {
      setSubmitting(false);
    }
  }, [
    submitting,
    trimmedLive,
    checkDuplicate,
    createTagMutation,
    color,
    icon,
    parentId,
    onCreated,
    onClose,
  ]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!canSubmit) return;
        void handleSubmit();
      }
    },
    [canSubmit, handleSubmit],
  );

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-4">
          {/* 属性行: 色 / アイコン / グループ */}
          <div className="flex items-center gap-2">
            {/* 色 */}
            <Popover open={colorPopoverOpen} onOpenChange={setColorPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={t('selectColor')}
                  className={cn(
                    'border-border hover:bg-state-hover active:bg-state-hover flex size-8 items-center justify-center rounded-lg border transition-colors',
                    'focus-visible:outline-ring outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
                  )}
                >
                  <span
                    className={cn('size-3.5 rounded-full', TAG_COLOR_MAP[color].dot)}
                    aria-hidden
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-2">
                <div
                  role="radiogroup"
                  aria-label={t('selectColor')}
                  className="grid grid-cols-5 gap-1"
                >
                  {TAG_COLOR_NAMES.map((c) => {
                    const active = color === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={c}
                        onClick={() => {
                          setColor(c);
                          setColorPopoverOpen(false);
                        }}
                        className={cn(
                          'flex size-8 items-center justify-center rounded-full transition-all',
                          active
                            ? 'ring-primary ring-2 ring-offset-2'
                            : 'hover:scale-110 active:scale-95',
                          TAG_COLOR_MAP[c].dot,
                        )}
                      />
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>

            {/* アイコン */}
            <Popover open={iconPopoverOpen} onOpenChange={setIconPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={t('selectIcon')}
                  className={cn(
                    'border-border hover:bg-state-hover active:bg-state-hover flex size-8 items-center justify-center rounded-lg border transition-colors',
                    'focus-visible:outline-ring outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
                  )}
                >
                  <TagIcon icon={icon ?? DEFAULT_TAG_ICON} color={color} size="sm" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-2">
                <div
                  role="radiogroup"
                  aria-label={t('selectIcon')}
                  className="grid grid-cols-8 gap-0"
                >
                  {CURATED_ICONS.map((iconName) => {
                    const pascal = kebabToPascal(iconName);
                    const LucideIcon = lucideIcons[pascal as keyof typeof lucideIcons];
                    if (!LucideIcon) return null;
                    const isSelected = (icon ?? DEFAULT_TAG_ICON) === iconName;
                    return (
                      <button
                        key={iconName}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        aria-label={iconName}
                        onClick={() => {
                          setIcon(iconName === DEFAULT_TAG_ICON ? null : iconName);
                          setIconPopoverOpen(false);
                        }}
                        className={cn(
                          'hover:bg-state-hover flex items-center justify-center rounded-lg p-2 transition-colors',
                          isSelected && 'ring-primary bg-state-hover ring-2',
                        )}
                      >
                        <LucideIcon className="size-4" />
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>

            {/* グループ */}
            <Popover open={groupPopoverOpen} onOpenChange={setGroupPopoverOpen}>
              <PopoverTrigger asChild>
                {selectedGroupOption ? (
                  <button
                    type="button"
                    aria-label={t('selectGroup')}
                    className={cn(
                      'flex h-8 max-w-[10rem] items-center gap-1 rounded-full border px-2 transition-colors',
                      'hover:bg-state-hover active:bg-state-hover',
                      'focus-visible:outline-ring outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
                    )}
                    style={{
                      borderColor: `var(--tag-${selectedGroupOption.color})`,
                      backgroundColor: `var(--tag-${selectedGroupOption.color}-tint)`,
                    }}
                  >
                    <TagIcon
                      icon={selectedGroupOption.icon}
                      color={selectedGroupOption.color}
                      size="sm"
                    />
                    <span className="text-foreground truncate text-xs">
                      {selectedGroupOption.name}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label={t('selectGroup')}
                    className={cn(
                      'border-border hover:bg-state-hover active:bg-state-hover flex size-8 items-center justify-center rounded-lg border border-dashed transition-colors',
                      'focus-visible:outline-ring outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
                    )}
                  >
                    <Folder className="text-muted-foreground size-4" aria-hidden />
                  </button>
                )}
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-1">
                <div
                  role="radiogroup"
                  aria-label={t('selectGroup')}
                  className="flex flex-col gap-1"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={parentId === null}
                    onClick={() => {
                      setParentId(null);
                      setGroupPopoverOpen(false);
                    }}
                    className={cn(
                      'hover:bg-state-hover text-muted-foreground flex h-8 items-center gap-2 rounded-lg px-2 text-left text-sm',
                      parentId === null && 'bg-state-selected',
                    )}
                  >
                    {t('noGroup')}
                  </button>
                  {groupOptions.map((option) => {
                    const active = parentId === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => {
                          setParentId(option.id);
                          setGroupPopoverOpen(false);
                        }}
                        className={cn(
                          'hover:bg-state-hover flex h-8 items-center gap-2 rounded-lg px-2 text-left text-sm',
                          active && 'bg-state-selected',
                        )}
                      >
                        <TagIcon icon={option.icon} color={option.color} size="sm" />
                        <span className="truncate">{option.name}</span>
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* 名前 */}
          <div className="flex flex-col gap-1">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleNameKeyDown}
              placeholder={t('namePlaceholder')}
              aria-label={t('name')}
              aria-invalid={duplicate || undefined}
              maxLength={TAG_NAME_MAX_LENGTH}
              disabled={submitting}
            />
            {errorMessage ? <FieldError announceImmediately>{errorMessage}</FieldError> : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            {tCommon('actions.cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            loading={submitting}
          >
            {tCommon('actions.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
