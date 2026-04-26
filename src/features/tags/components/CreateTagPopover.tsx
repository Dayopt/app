'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Folder, icons as lucideIcons } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/lib/components/ui/button';
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from '@/lib/components/ui/drawer';
import { FieldError } from '@/lib/components/ui/field';
import { Input } from '@/lib/components/ui/input';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/lib/components/ui/popover';
import {
  DEFAULT_TAG_COLOR,
  TAG_COLOR_MAP,
  TAG_COLOR_NAMES,
  TAG_NAME_MAX_LENGTH,
  resolveTagColor,
} from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

import { CURATED_ICONS, DEFAULT_TAG_ICON, kebabToPascal } from '../lib/curated-icons';
import { TagIcon } from './TagIcon';

import type { TagColorName } from '@/lib/tag-colors';
import type { Tag } from '../types';

export interface CreateTagPopoverSubmitInput {
  name: string;
  color: TagColorName;
  icon: string | null;
  parentId: string | null;
}

export interface CreateTagPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 既存タグ一覧。重複チェックと親候補の計算に使用 */
  existingTags: Tag[];
  /** 初期選択親タグ（null = ルート） */
  initialParentId?: string | null;
  /** 送信。成功時に呼び出し側が close する */
  onSubmit: (input: CreateTagPopoverSubmitInput) => void | Promise<void>;
  /**
   * モバイル時は bottom sheet (vaul Drawer)、PC 時は Popover。指定なしは PC 扱い。
   * モバイル時の anchor モード: children 省略可（コントロール only で開閉する）。
   */
  isMobile?: boolean;
  /**
   * 親 Drawer の中で開く場合 true。vaul の nested mode を有効化し、親 Drawer をスケールさせる。
   * `isMobile` と組み合わせる時のみ意味を持つ。
   */
  nestedDrawer?: boolean;
  /**
   * PopoverTrigger / DrawerTrigger として使う要素。渡すとこの element がクリックで開く。
   * 省略時は anchor モード: PC は親要素（`relative`）の中に PopoverAnchor を敷く。
   * モバイル時は controlled open のみで開閉する。
   */
  children?: React.ReactNode;
}

interface GroupOption {
  id: string;
  name: string;
  color: TagColorName;
  icon: string | null;
}

/**
 * タグ新規作成 UI（属性行 + 名前入力）。
 *
 * - 色 / アイコン / グループ / 名前の 4 つを 1 画面で指定して作成
 * - 名前は同一親内で重複不可（200ms debounce でクライアント検証）
 * - Enter 送信 / Esc で close（属性 Popover 内の Esc は内側だけ閉じる）
 * - Trigger モード（children あり）: + ボタン等をラップ
 * - Anchor モード（children なし、PC のみ）: 親要素を `position: relative` にして中に置く
 * - レスポンシブ: `isMobile` 指定で bottom sheet (vaul Drawer)、未指定は Popover
 */
export function CreateTagPopover({
  open,
  onOpenChange,
  existingTags,
  initialParentId,
  onSubmit,
  isMobile,
  nestedDrawer,
  children,
}: CreateTagPopoverProps) {
  const t = useTranslations('calendar.filter.createDialog');
  const tCommon = useTranslations('common');

  const [name, setName] = useState('');
  const [debouncedName, setDebouncedName] = useState('');
  const [color, setColor] = useState<TagColorName>(DEFAULT_TAG_COLOR);
  const [icon, setIcon] = useState<string | null>(null);
  const [parentId, setParentId] = useState<string | null>(initialParentId ?? null);
  const [submitting, setSubmitting] = useState(false);

  const [colorPopoverOpen, setColorPopoverOpen] = useState(false);
  const [iconPopoverOpen, setIconPopoverOpen] = useState(false);
  const [groupPopoverOpen, setGroupPopoverOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setDebouncedName('');
    setColor(DEFAULT_TAG_COLOR);
    setIcon(null);
    setParentId(initialParentId ?? null);
    setSubmitting(false);
    setColorPopoverOpen(false);
    setIconPopoverOpen(false);
    setGroupPopoverOpen(false);
  }, [open, initialParentId]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedName(name), 200);
    return () => clearTimeout(id);
  }, [name]);

  const groupOptions = useMemo<GroupOption[]>(() => {
    return existingTags
      .filter((tag) => tag.parent_id === null && tag.is_active !== false)
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((tag) => ({
        id: tag.id,
        name: tag.name,
        color: resolveTagColor(tag.color),
        icon: tag.icon ?? null,
      }));
  }, [existingTags]);

  const selectedGroupOption = useMemo<GroupOption | null>(
    () => groupOptions.find((option) => option.id === parentId) ?? null,
    [groupOptions, parentId],
  );

  const trimmedDebounced = debouncedName.trim();

  const duplicate = useMemo(() => {
    if (!trimmedDebounced) return false;
    const lower = trimmedDebounced.toLowerCase();
    return existingTags.some(
      (tag) => tag.parent_id === parentId && tag.name.toLowerCase() === lower,
    );
  }, [existingTags, parentId, trimmedDebounced]);

  const trimmedLive = name.trim();
  const canSubmit = trimmedLive.length > 0 && !duplicate && !submitting;

  const errorMessage = duplicate ? t('duplicateName') : null;

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (
      existingTags.some((tag) => tag.parent_id === parentId && tag.name.toLowerCase() === lower)
    ) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ name: trimmed, color, icon, parentId });
    } finally {
      setSubmitting(false);
    }
  }, [submitting, name, existingTags, parentId, onSubmit, color, icon]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!canSubmit) return;
        void handleSubmit();
      }
    },
    [handleSubmit, canSubmit],
  );

  const formBody = (
    <div className="flex flex-col gap-3">
      <div className="text-foreground text-sm font-medium">{t('title')}</div>

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
              <span className={cn('size-3.5 rounded-full', TAG_COLOR_MAP[color].dot)} aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-2">
            <div role="radiogroup" aria-label={t('selectColor')} className="grid grid-cols-5 gap-1">
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
            <div role="radiogroup" aria-label={t('selectIcon')} className="grid grid-cols-8 gap-0">
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
                <span className="text-foreground truncate text-xs">{selectedGroupOption.name}</span>
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
            <div role="radiogroup" aria-label={t('selectGroup')} className="flex flex-col gap-1">
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
          {tCommon('actions.create')}
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        handleOnly
        repositionInputs={false}
        nested={nestedDrawer ?? false}
      >
        {children ? <DrawerTrigger asChild>{children}</DrawerTrigger> : null}
        <DrawerContent className="bg-card z-modal shadow-card flex flex-col gap-0 overflow-hidden rounded-t-2xl p-0">
          <DrawerTitle className="sr-only">{t('title')}</DrawerTitle>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="mx-auto w-full max-w-lg">{formBody}</div>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

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
        className="w-80 p-3"
        onOpenAutoFocus={(e) => {
          // Radix のデフォルト auto-focus と Input の autoFocus が競合すると
          // focus change が一瞬 outside 扱いになり即閉じるため無効化する。
          e.preventDefault();
        }}
      >
        {formBody}
      </PopoverContent>
    </Popover>
  );
}
