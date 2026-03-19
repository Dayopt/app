'use client';

/**
 * お問い合わせダイアログ（Container）
 *
 * tRPC mutation + toast を接続し、UIは ContactDialogContent に委譲。
 * 環境情報はクライアントから自動収集。
 */

import { useCallback, useMemo } from 'react';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { api } from '@/platform/trpc';

import { collectEnvironment } from '../lib/collect-environment';
import type { ContactCategory } from '../types';
import { ContactDialogContent } from './ContactDialogContent';

/** package.json の version を Next.js 経由で取得 */
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown';

interface ContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** お問い合わせダイアログのコンテナコンポーネント（tRPC送信・環境情報収集を担当） */
export function ContactDialog({ open, onOpenChange }: ContactDialogProps) {
  const t = useTranslations();

  const environment = useMemo(() => collectEnvironment(APP_VERSION), []);

  const submitMutation = api.contact.submit.useMutation({
    onSuccess: () => {
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
      submitMutation.mutate({ ...input, environment });
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
