'use client';

/**
 * アクティビティ新規作成モーダル
 *
 * `useShellStore.activeSheet` で管理され、どこからでも
 * `useShellStore.use.openActivityCreateModal()` で開ける。
 * 名前 + 所属カテゴリーの 2 項目だけを入力する。色・アイコンを持つのはカテゴリーだけで、
 * アクティビティは所属カテゴリーから継承するため、ここには置かない（#2162 §4-6）。
 *
 * 所属カテゴリーは「カテゴリーなし」+ 既存カテゴリーを常時インライン表示するチップ列で選ぶ
 * （#2406。クリックで一覧を開く必要をなくす）。カテゴリーの新規作成はこのモーダルからは
 * 行わず、サイドバーのカテゴリー追加ポップオーバーに一本化する。
 *
 * Dialog の responsive='auto' に依存し、PC=Dialog / モバイル=Drawer に自動切替。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

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
} from '@dayopt/components';

import { useActivities, useCategories } from '../hooks/useActivitiesQuery';
import { useCreateActivity } from '../hooks/useActivityMutations';
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
  const tCommon = useTranslations('common');

  const { data: existingActivities } = useActivities();
  const { data: categories } = useCategories();
  const createActivityMutation = useCreateActivity();

  const [name, setName] = useState('');
  const [debouncedName, setDebouncedName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(initialCategoryId);
  const [submitting, setSubmitting] = useState(false);

  // モーダル open 時に初期値を同期
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setName('');
      setDebouncedName('');
      setCategoryId(initialCategoryId);
      setSubmitting(false);
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

          {/* 所属カテゴリー: 一覧を常時表示し、選ぶのに追加クリックを要らなくする */}
          <div role="radiogroup" aria-label={t('selectCategory')} className="flex flex-wrap gap-2">
            <button
              type="button"
              role="radio"
              aria-checked={categoryId === null}
              onClick={() => setCategoryId(null)}
              className={cn(
                'hover:bg-state-hover flex h-8 items-center gap-2 rounded-full border px-2 text-sm transition-colors',
                categoryId === null ? 'border-border bg-state-selected' : 'border-border',
              )}
            >
              <ActivityIcon icon={null} color={null} neutral size="sm" />
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
                  onClick={() => setCategoryId(option.id)}
                  className={cn(
                    'hover:bg-state-hover flex h-8 items-center gap-2 rounded-full border px-2 text-sm transition-colors',
                    active
                      ? cn(
                          getCategoryColorClasses(option.color).border,
                          getCategoryColorClasses(option.color).tint,
                        )
                      : 'border-border',
                  )}
                >
                  <ActivityIcon icon={option.icon} color={option.color} size="sm" />
                  <span className="max-w-24 truncate">{option.name}</span>
                </button>
              );
            })}
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
