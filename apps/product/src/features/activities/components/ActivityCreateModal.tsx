'use client';

/**
 * アクティビティ新規作成モーダル
 *
 * `useShellStore.activeSheet` で管理され、どこからでも
 * `useShellStore.use.openActivityCreateModal()` で開ける。
 * 名前 + 所属カテゴリーの 2 項目だけを入力する。色・アイコンを持つのはカテゴリーだけで、
 * アクティビティは所属カテゴリーから継承するため、ここには置かない（#2162 §4-6）。
 *
 * Dialog の responsive='auto' に依存し、PC=Dialog / モバイル=Drawer に自動切替。
 *
 * フォームの状態と検証は `useActivityCreateForm`、カテゴリー選択の UI は
 * `ActivityCategoryPickerRow` に切り出してある。
 */

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldError,
  Input,
} from '@dayopt/components';
import { useTranslations } from 'next-intl';

import { useActivityCreateForm } from '../hooks/useActivityCreateForm';
import { ACTIVITY_NAME_MAX_LENGTH } from '../lib/category-colors';
import { ActivityCategoryPickerRow } from './ActivityCategoryPickerRow';

import type { CreatedActivityPayload } from '@/lib/stores/useShellStore';

interface ActivityCreateModalProps {
  open: boolean;
  onClose: () => void;
  initialCategoryId: string | null;
  /** 作成成功時に呼ばれる。selection 反映等に使う */
  onCreated?: ((activity: CreatedActivityPayload) => void) | undefined;
}

export function ActivityCreateModal({
  open,
  onClose,
  initialCategoryId,
  onCreated,
}: ActivityCreateModalProps) {
  const t = useTranslations('calendar.filter.createDialog');
  const tCommon = useTranslations('common');

  const {
    name,
    setName,
    categoryId,
    setCategoryId,
    categoryOptions,
    duplicate,
    errorMessage,
    canSubmit,
    submitting,
    handleSubmit,
    handleNameKeyDown,
  } = useActivityCreateForm({ open, initialCategoryId, onCreated, onClose });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      // 背景を暗転させない軽いポップアップにする（2026-09-03 User 指示）。
      // 位置は中央のまま。モバイルの Drawer は常に modal なので影響しない
      modal={false}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-4">
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

          <ActivityCategoryPickerRow
            categoryId={categoryId}
            onChange={setCategoryId}
            categoryOptions={categoryOptions}
          />
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
