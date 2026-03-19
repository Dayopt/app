'use client';

import { useCallback, useEffect, useState } from 'react';

import { useTranslations } from 'next-intl';

import { ActionFooter } from '@/components/ui/action-footer';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useHasMounted } from '@/hooks/useHasMounted';

import { closeModal, useModalStore, type RecurringEditScope } from '@/stores/useModalStore';

// Re-export type for barrel consumers
export type { RecurringEditScope };

/**
 * 繰り返しプラン編集確認ダイアログ
 *
 * Radix AlertDialog ベース（フォーカストラップ・ESCキー処理を自動管理）
 * Googleカレンダー風のスコープ選択:
 * - このイベントのみ
 * - このイベント以降すべて
 * - すべてのイベント
 */
export function RecurringEditConfirmDialog() {
  const t = useTranslations();
  const [isProcessing, setIsProcessing] = useState(false);
  const mounted = useHasMounted();
  const [scope, setScope] = useState<RecurringEditScope>('this');

  const modal = useModalStore((state) => state.modal);
  const isRecurringEdit = modal?.type === 'recurringEdit';
  const isOpen = isRecurringEdit;
  const mode = isRecurringEdit ? modal.mode : 'edit';
  const onConfirm = isRecurringEdit ? modal.onConfirm : null;

  // ダイアログが開くたびにscopeをリセット
  useEffect(() => {
    if (isOpen) {
      setScope('this');
    }
  }, [isOpen]);

  const handleConfirm = useCallback(async () => {
    if (!onConfirm) return;
    setIsProcessing(true);
    try {
      await onConfirm(scope);
    } finally {
      setIsProcessing(false);
      closeModal();
    }
  }, [onConfirm, scope]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && !isProcessing) {
        closeModal();
      }
    },
    [isProcessing],
  );

  if (!mounted) return null;

  const isEdit = mode === 'edit';
  const title = t(
    isEdit ? 'common.confirm.recurring.editTitle' : 'common.confirm.recurring.deleteTitle',
  );

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-[360px]">
        {/* Header */}
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription className="sr-only">{title}</AlertDialogDescription>

        {/* スコープ選択 */}
        <RadioGroup
          value={scope}
          onValueChange={(value) => setScope(value as RecurringEditScope)}
          className="space-y-2"
        >
          <label htmlFor="scope-this" className="flex cursor-pointer items-center gap-4">
            <RadioGroupItem value="this" id="scope-this" />
            <span className="text-sm">{t('common.confirm.recurring.thisOnly')}</span>
          </label>
          <label htmlFor="scope-future" className="flex cursor-pointer items-center gap-4">
            <RadioGroupItem value="thisAndFuture" id="scope-future" />
            <span className="text-sm">{t('common.confirm.recurring.thisAndFuture')}</span>
          </label>
          <label htmlFor="scope-all" className="flex cursor-pointer items-center gap-4">
            <RadioGroupItem value="all" id="scope-all" />
            <span className="text-sm">{t('common.confirm.recurring.allEvents')}</span>
          </label>
        </RadioGroup>

        {/* Footer */}
        <ActionFooter>
          <Button variant="outline" onClick={closeModal} disabled={isProcessing}>
            {t('common.actions.cancel')}
          </Button>
          <Button
            variant={isEdit ? 'primary' : 'destructive'}
            onClick={handleConfirm}
            disabled={isProcessing}
          >
            {isProcessing
              ? t('common.form.processing')
              : isEdit
                ? t('common.confirm.recurring.apply')
                : t('common.actions.delete')}
          </Button>
        </ActionFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
