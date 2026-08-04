'use client';

import { useTranslations } from 'next-intl';

import { ConfirmDialog } from '@/components/ui/overlays/confirm-dialog';

interface TagDeleteConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  tagName: string;
  /** 未分類化される関連 Plan / Record の件数 */
  recordCount: number;
}

/**
 * タグ完全削除の確認ダイアログ
 *
 * タグを削除しても関連する Plan / Record は削除されず未分類になる（#1576）。
 * その契約を件数つきで伝えてから destructive 確認を取る。
 */
export function TagDeleteConfirmDialog({
  open,
  onClose,
  onConfirm,
  tagName,
  recordCount,
}: TagDeleteConfirmDialogProps) {
  const t = useTranslations('tags');

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title={t('delete.confirmTitleWithName', { name: tagName })}
      description={t('delete.unclassifyDescription', { count: recordCount })}
      variant="destructive"
      confirmLabel={t('delete.confirmButton')}
    />
  );
}
