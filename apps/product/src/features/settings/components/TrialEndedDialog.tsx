'use client';

import { useRef } from 'react';

import { useTranslations } from 'next-intl';

import { useRouter } from '@dayopt/i18n/navigation';

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from '@dayopt/components';

interface TrialEndedDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Trial終了告知ダイアログ
 *
 * Trial終了と同時に1度だけ表示。ESC/overlay/×では閉じられない。
 * 「Freeで続ける」でフラグ保存して閉じ、「Proを続ける」で /settings/billing へ遷移。
 */
function TrialEndedDialog({ open, onClose }: TrialEndedDialogProps) {
  const t = useTranslations('common.trialEnded');
  const router = useRouter();
  const freeButtonRef = useRef<HTMLButtonElement>(null);

  const handleContinueFree = () => {
    onClose();
  };

  const handleContinuePro = () => {
    onClose();
    router.push('/settings/billing');
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent
        // 初期フォーカスを「Freeで続ける」に設定（安全な選択肢）
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          freeButtonRef.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{t('title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('description')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button ref={freeButtonRef} variant="outline" onClick={handleContinueFree}>
            {t('continueFree')}
          </Button>
          <Button onClick={handleContinuePro}>{t('continuePro')}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { TrialEndedDialog };
