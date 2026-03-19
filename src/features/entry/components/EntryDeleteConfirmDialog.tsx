'use client';

import { useCallback } from 'react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useTranslations } from 'next-intl';

import { closeModal, useModalStore } from '@/stores/useModalStore';

/**
 * プラン削除確認ダイアログ
 *
 * Zustand ストアと連携する ConfirmDialog のラッパー。
 * グローバルに配置し、ストア経由で開閉を制御する。
 */
export function EntryDeleteConfirmDialog() {
  const t = useTranslations();

  const modal = useModalStore((state) => state.modal);
  const isDeleteConfirm = modal?.type === 'deleteConfirm';
  const isOpen = isDeleteConfirm;
  const planTitle = isDeleteConfirm ? modal.planTitle : null;
  const onConfirm = isDeleteConfirm ? modal.onConfirm : null;
  const closeDialog = closeModal;

  const title = planTitle
    ? t('plan.delete.confirmTitleWithName', { name: planTitle })
    : t('plan.delete.confirmTitle');

  const handleConfirm = useCallback(async () => {
    if (!onConfirm) return;
    await onConfirm();
    closeDialog();
  }, [onConfirm, closeDialog]);

  return (
    <ConfirmDialog
      open={isOpen}
      onClose={closeDialog}
      onConfirm={handleConfirm}
      title={title}
      description={t('plan.delete.description')}
      variant="destructive"
      confirmLabel={t('plan.delete.confirm')}
      loadingLabel={t('plan.delete.deleting')}
    />
  );
}
