'use client';

import { useRef, useState } from 'react';

import { useTranslations } from 'next-intl';

import { toast } from '@/lib/toast';
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

import { useStableBillingOperation } from '../hooks/useStableBillingOperation';
import { getBillingOperationErrorPresentation } from '../lib/billing-operation';

interface PaymentErrorDialogProps {
  open: boolean;
  onClose: () => Promise<void> | void;
}

/**
 * 決済エラーダイアログ（Stage 2: 全リトライ失敗時）
 *
 * past_due 状態で1日1回表示。ESC/overlay/×では閉じられない。
 * 「支払い情報を確認」で Stripe Customer Portal へ遷移。
 */
function OpenPaymentErrorDialog({ onClose }: Pick<PaymentErrorDialogProps, 'onClose'>) {
  const t = useTranslations();
  const checkPaymentRef = useRef<HTMLButtonElement>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [billingActionClosed, setBillingActionClosed] = useState(false);
  const {
    begin: beginPortalAttempt,
    isLocked: isPortalAttemptLocked,
    reset: resetPortalAttempt,
    settle: settlePortalAttempt,
  } = useStableBillingOperation();

  const createPortalSession = api.billing.createPortalSession.useMutation({
    onSuccess: async (data, variables) => {
      if (!variables) return;
      if (data?.url && settlePortalAttempt(variables.operationId, 'terminal')) {
        try {
          await onClose();
        } finally {
          window.location.href = data.url;
        }
      }
    },
    onError: (error, variables) => {
      if (!variables) return;
      const { closesBillingActions, messageKey, retryable } =
        getBillingOperationErrorPresentation(error);
      const isCurrent = settlePortalAttempt(
        variables.operationId,
        retryable ? 'retryable' : 'terminal',
      );
      if (!isCurrent) return;

      setIsRedirecting(false);
      if (closesBillingActions) setBillingActionClosed(true);
      toast.error(t(messageKey));
    },
  });

  const handleCheckPayment = () => {
    const operationId = beginPortalAttempt();
    if (!operationId) return;

    setIsRedirecting(true);
    createPortalSession.mutate({ operationId });
  };

  const handleClose = async () => {
    resetPortalAttempt();
    await onClose();
  };

  const isPending = isRedirecting || isPortalAttemptLocked;

  return (
    <AlertDialog open>
      <AlertDialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          checkPaymentRef.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{t('common.paymentError.title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('common.paymentError.description')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              void handleClose();
            }}
            disabled={isPending}
          >
            {t('common.paymentError.later')}
          </Button>
          <Button
            ref={checkPaymentRef}
            onClick={handleCheckPayment}
            disabled={isPending || billingActionClosed}
          >
            {t('common.paymentError.checkPayment')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PaymentErrorDialog({ open, onClose }: PaymentErrorDialogProps) {
  if (!open) return null;
  return <OpenPaymentErrorDialog onClose={onClose} />;
}

export { PaymentErrorDialog };
