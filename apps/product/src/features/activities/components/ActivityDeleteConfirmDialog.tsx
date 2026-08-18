'use client';

import { useTranslations } from 'next-intl';

import { ConfirmDialog } from '@/components/ui/overlays/confirm-dialog';

interface ActivityDeleteConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  /**
   * 'activity' = アクティビティ削除（参照する予定・記録が「アクティビティなし」になる）
   * 'category' = カテゴリー削除（所属アクティビティが未分類になる。予定・記録は変わらない）
   */
  kind: 'activity' | 'category';
  name: string;
  /** kind='activity' なら関連する予定・記録の件数、kind='category' なら所属アクティビティの件数 */
  affectedCount: number;
}

/**
 * アクティビティ / カテゴリー完全削除の確認ダイアログ
 *
 * どちらも削除しても関連レコードは削除されない（アクティビティ削除は予定・記録が
 * 「アクティビティなし」になり、カテゴリー削除は所属アクティビティが未分類になる）。
 * 2 つは意味が違うため、`kind` で説明文を出し分ける。
 */
export function ActivityDeleteConfirmDialog({
  open,
  onClose,
  onConfirm,
  kind,
  name,
  affectedCount,
}: ActivityDeleteConfirmDialogProps) {
  const t = useTranslations('activities');

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title={t('delete.confirmTitle', { name })}
      description={t(
        kind === 'activity' ? 'delete.activityDescription' : 'delete.categoryDescription',
        { count: affectedCount },
      )}
      variant="destructive"
      confirmLabel={t('delete.confirmButton')}
    />
  );
}
