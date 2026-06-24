'use client';

import { useRef, useState } from 'react';

import { useTranslations } from 'next-intl';

import { api } from '@/lib/trpc';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from '@dayopt/components';

interface PaymentErrorDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 決済エラーダイアログ（Stage 2: 全リトライ失敗時）
 *
 * past_due 状態で1日1回表示。ESC/overlay/×では閉じられない。
 * 「支払い情報を確認」で Stripe Customer Portal へ遷移。
 */
function PaymentErrorDialog({ open, onClose }: PaymentErrorDialogProps) {
  const t = useTranslations('common.paymentError');
  const checkPaymentRef = useRef<HTMLButtonElement>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const createPortalSession = api.billing.createPortalSession.useMutation({
    onSuccess: (data) => {
      if (data?.url) {
        window.location.href = data.url;
      }
    },
    onSettled: () => {
      setIsRedirecting(false);
    },
  });

  const handleCheckPayment = () => {
    setIsRedirecting(true);
    onClose();
    createPortalSession.mutate();
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          checkPaymentRef.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{t('title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('description')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isRedirecting}>
            {t('later')}
          </Button>
          <Button ref={checkPaymentRef} onClick={handleCheckPayment} disabled={isRedirecting}>
            {t('checkPayment')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { PaymentErrorDialog };
