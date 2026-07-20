'use client';

/**
 * お問い合わせダイアログ（Container）
 *
 * tRPC mutation + toast を接続し、UIは ContactDialogContent に委譲。
 * 環境情報はクライアントから自動収集。
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';

import { APP_VERSION } from '@/lib/app-info';
import { api } from '@/lib/trpc';

import { collectEnvironment } from '../lib/collect-environment';
import type { ContactCategory, ContactEnvironment } from '../types';
import { ContactDialogContent } from './ContactDialogContent';

interface ContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SubmissionAttempt = {
  submissionId: string;
  payloadKey: string;
};

function getSubmissionPayloadKey(
  input: { category: ContactCategory; message: string },
  environment: ContactEnvironment,
): string {
  return JSON.stringify([
    input.category,
    input.message,
    environment.appVersion,
    environment.os,
    environment.browser,
    environment.timezone,
    environment.language,
  ]);
}

/** お問い合わせダイアログのコンテナコンポーネント（tRPC送信・環境情報収集を担当） */
export function ContactDialog({ open, onOpenChange }: ContactDialogProps) {
  const t = useTranslations();

  const environment = useMemo(() => collectEnvironment(APP_VERSION), []);
  const submissionAttemptRef = useRef<SubmissionAttempt | null>(null);

  useEffect(() => {
    if (!open) submissionAttemptRef.current = null;
  }, [open]);

  const submitMutation = api.contact.submit.useMutation({
    onSuccess: () => {
      submissionAttemptRef.current = null;
      toast.success(t('contact.submitSuccess'));
      onOpenChange(false);
    },
    onError: (error) => {
      if (error.data?.code === 'TOO_MANY_REQUESTS') {
        toast.error(t('contact.rateLimited'));
      } else {
        toast.error(t('contact.submitError'));
      }
    },
  });

  const handleSubmit = useCallback(
    (input: { category: ContactCategory; message: string }) => {
      const payloadKey = getSubmissionPayloadKey(input, environment);
      const previousAttempt = submissionAttemptRef.current;
      const submissionId =
        previousAttempt?.payloadKey === payloadKey
          ? previousAttempt.submissionId
          : crypto.randomUUID();
      submissionAttemptRef.current = { submissionId, payloadKey };
      submitMutation.mutate({ ...input, submissionId, environment });
    },
    [submitMutation, environment],
  );

  const categoryLabel = useCallback((cat: ContactCategory) => t(`contact.category.${cat}`), [t]);

  return (
    <ContactDialogContent
      open={open}
      onOpenChange={onOpenChange}
      onSubmit={handleSubmit}
      isPending={submitMutation.isPending}
      categoryLabel={categoryLabel}
      labels={{
        title: t('contact.title'),
        description: t('contact.description'),
        categoryLabel: t('contact.category.label'),
        messageLabel: t('contact.message.label'),
        messagePlaceholder: t('contact.message.placeholder'),
        messageMinLength: t('contact.message.minLength'),
        submit: t('contact.submit'),
        cancel: t('common.actions.cancel'),
      }}
    />
  );
}
