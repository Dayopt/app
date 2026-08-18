'use client';

/**
 * アクティビティ新規作成モーダル
 *
 * `useShellStore.activeSheet` で管理され、どこからでも
 * `useShellStore.use.openActivityCreateModal()` で開ける。
 * 名前 + 所属カテゴリーの 2 項目だけを入力する。色・アイコンを持つのはカテゴリーだけで、
 * アクティビティは所属カテゴリーから継承するため、ここには置かない（#2162 §4-6）。
 *
 * カテゴリー選択の中に「新しいカテゴリーを作成」を置き、最初のカテゴリーもここで
 * 作れるようにする（作成した色・アイコンの調整はサイドバーのカテゴリーメニューから行う）。
 *
 * Dialog の responsive='auto' に依存し、PC=Dialog / モバイル=Drawer に自動切替。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Folder } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldError,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@dayopt/components';

import { useActivities, useCategories } from '../hooks/useActivitiesQuery';
import { useCreateActivity } from '../hooks/useActivityMutations';
import { useCreateCategory } from '../hooks/useCategoryMutations';
import { ACTIVITY_NAME_MAX_LENGTH, getCategoryColorClasses } from '../lib/category-colors';
import { ActivityIcon } from './ActivityIcon';

import type { CreatedActivityPayload } from '@/lib/stores/useShellStore';
import type { Activity, Category } from '../types';

interface ActivityCreateModalProps {
  open: boolean;
  onClose: () => void;
  initialCategoryId: string | null;
  /** 作成成功時に呼ばれる。selection 反映等に使う */
  onCreated?: (activity: CreatedActivityPayload) => void;
}

export function ActivityCreateModal({
  open,
  onClose,
  initialCategoryId,
  onCreated,
}: ActivityCreateModalProps) {
  const t = useTranslations('calendar.filter.createDialog');
  const tFilter = useTranslations('calendar.filter');
  const tCommon = useTranslations('common');

  const { data: existingActivities } = useActivities();
  const { data: categories } = useCategories();
  const createActivityMutation = useCreateActivity();
  const createCategoryMutation = useCreateCategory();

  const [name, setName] = useState('');
  const [debouncedName, setDebouncedName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(initialCategoryId);
  const [submitting, setSubmitting] = useState(false);

  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categorySubmitting, setCategorySubmitting] = useState(false);

  // モーダル open 時に初期値を同期
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setName('');
      setDebouncedName('');
      setCategoryId(initialCategoryId);
      setSubmitting(false);
      setCategoryPopoverOpen(false);
      setCreatingCategory(false);
      setNewCategoryName('');
      setCategorySubmitting(false);
    });
  }, [open, initialCategoryId]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedName(name), 200);
    return () => clearTimeout(id);
  }, [name]);

  const categoryOptions = useMemo<Category[]>(
    () => (categories ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  const selectedCategory = useMemo<Category | null>(
    () => categoryOptions.find((option) => option.id === categoryId) ?? null,
    [categoryOptions, categoryId],
  );

  const activeActivities = useMemo<Activity[]>(
    () => existingActivities ?? [],
    [existingActivities],
  );

  const trimmedDebounced = debouncedName.trim();
  const trimmedLive = name.trim();

  const checkDuplicate = useCallback(
    (value: string) => {
      if (!value) return false;
      const lower = value.toLowerCase();
      return activeActivities.some(
        (activity) => activity.category_id === categoryId && activity.name.toLowerCase() === lower,
      );
    },
    [activeActivities, categoryId],
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
      const created = await createActivityMutation.mutateAsync({
        name: trimmedLive,
        categoryId,
      });
      onCreated?.({
        id: created.id,
        name: created.name,
        categoryId: created.category_id,
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
    createActivityMutation,
    categoryId,
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

  const trimmedNewCategoryName = newCategoryName.trim();

  const handleCreateCategory = useCallback(async () => {
    if (categorySubmitting || trimmedNewCategoryName.length === 0) return;
    setCategorySubmitting(true);
    try {
      const created = await createCategoryMutation.mutateAsync({ name: trimmedNewCategoryName });
      // 作成直後にそのまま選択し、フォームを閉じてカテゴリー選択に戻る
      setCategoryId(created.id);
      setCreatingCategory(false);
      setNewCategoryName('');
      setCategoryPopoverOpen(false);
    } catch {
      // mutation hook 側で toast 済み。フォームは開いたまま
    } finally {
      setCategorySubmitting(false);
    }
  }, [categorySubmitting, trimmedNewCategoryName, createCategoryMutation]);

  const handleNewCategoryKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (trimmedNewCategoryName.length === 0 || categorySubmitting) return;
        void handleCreateCategory();
      }
    },
    [trimmedNewCategoryName, categorySubmitting, handleCreateCategory],
  );

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-4">
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
              maxLength={ACTIVITY_NAME_MAX_LENGTH}
              disabled={submitting}
            />
            {errorMessage ? <FieldError announceImmediately>{errorMessage}</FieldError> : null}
          </div>

          {/* 所属カテゴリー */}
          <Popover
            open={categoryPopoverOpen}
            onOpenChange={(next) => {
              setCategoryPopoverOpen(next);
              if (!next) {
                setCreatingCategory(false);
                setNewCategoryName('');
              }
            }}
          >
            <PopoverTrigger asChild>
              {selectedCategory ? (
                <button
                  type="button"
                  aria-label={t('selectCategory')}
                  className={cn(
                    'flex h-8 max-w-40 items-center gap-1 rounded-full border px-2 transition-colors',
                    'hover:bg-state-hover active:bg-state-hover',
                    'focus-visible:outline-ring outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
                    getCategoryColorClasses(selectedCategory.color).border,
                    getCategoryColorClasses(selectedCategory.color).tint,
                  )}
                >
                  <ActivityIcon
                    icon={selectedCategory.icon}
                    color={selectedCategory.color}
                    size="sm"
                  />
                  <span className="text-foreground truncate text-xs">{selectedCategory.name}</span>
                </button>
              ) : (
                <button
                  type="button"
                  aria-label={t('selectCategory')}
                  className={cn(
                    'border-border hover:bg-state-hover active:bg-state-hover flex h-8 items-center gap-1 rounded-full border border-dashed px-2 transition-colors',
                    'focus-visible:outline-ring outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
                  )}
                >
                  <Folder className="text-muted-foreground size-3.5" aria-hidden />
                  <span className="text-muted-foreground text-xs">{t('noCategory')}</span>
                </button>
              )}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-1">
              {creatingCategory ? (
                <div className="flex flex-col gap-2 p-2">
                  <Input
                    autoFocus
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={handleNewCategoryKeyDown}
                    placeholder={t('categoryNamePlaceholder')}
                    aria-label={t('categoryName')}
                    maxLength={ACTIVITY_NAME_MAX_LENGTH}
                    disabled={categorySubmitting}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCreatingCategory(false);
                        setNewCategoryName('');
                      }}
                      disabled={categorySubmitting}
                    >
                      {tCommon('actions.cancel')}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void handleCreateCategory()}
                      disabled={trimmedNewCategoryName.length === 0 || categorySubmitting}
                      loading={categorySubmitting}
                    >
                      {tCommon('actions.add')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  role="radiogroup"
                  aria-label={t('selectCategory')}
                  className="flex flex-col gap-1"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={categoryId === null}
                    onClick={() => {
                      setCategoryId(null);
                      setCategoryPopoverOpen(false);
                    }}
                    className={cn(
                      'hover:bg-state-hover text-muted-foreground flex h-8 items-center gap-2 rounded-lg px-2 text-left text-sm',
                      categoryId === null && 'bg-state-selected',
                    )}
                  >
                    {t('noCategory')}
                  </button>
                  {categoryOptions.map((option) => {
                    const active = categoryId === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => {
                          setCategoryId(option.id);
                          setCategoryPopoverOpen(false);
                        }}
                        className={cn(
                          'hover:bg-state-hover flex h-8 items-center gap-2 rounded-lg px-2 text-left text-sm',
                          active && 'bg-state-selected',
                        )}
                      >
                        <ActivityIcon icon={option.icon} color={option.color} size="sm" />
                        <span className="truncate">{option.name}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setCreatingCategory(true)}
                    className="hover:bg-state-hover text-primary flex h-8 items-center gap-2 rounded-lg px-2 text-left text-sm"
                  >
                    {tFilter('createCategory')}
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>
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
