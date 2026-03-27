'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AlertTriangle, Check, CreditCard, RefreshCw, Sparkles, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { api } from '@/platform/trpc';

import { LabeledRow } from '@/components/common/LabeledRow';
import { SectionCard } from '@/components/common/SectionCard';

interface Plan {
  id: string;
  nameKey: string;
  price: number;
  featureKeys: string[];
  recommended?: boolean;
}

const PLANS: Plan[] = [
  {
    id: 'free',
    nameKey: 'settings.subscription.plans.free.name',
    price: 0,
    featureKeys: [
      'settings.subscription.plans.free.features.timeboxing',
      'settings.subscription.plans.free.features.basicAnalytics',
      'settings.subscription.plans.free.features.tags',
      'settings.subscription.plans.free.features.ai',
    ],
  },
  {
    id: 'pro',
    nameKey: 'settings.subscription.plans.pro.name',
    price: 5,
    featureKeys: [
      'settings.subscription.plans.pro.features.fullAnalytics',
      'settings.subscription.plans.pro.features.unlimitedTags',
      'settings.subscription.plans.pro.features.api',
      'settings.subscription.plans.pro.features.dataExport',
      'settings.subscription.plans.pro.features.unlimitedAI',
    ],
    recommended: true,
  },
];

/**
 * Stripe Price ID
 *
 * Stripe Dashboard で作成した Price の ID を環境変数で管理。
 * ビルド時に埋め込まれるため NEXT_PUBLIC_ プレフィックス。
 */
const STRIPE_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID ?? '';

/** 請求・サブスクリプション設定コンポーネント。プラン変更・支払方法・請求履歴・キャンセルを管理 */
export function BillingSettings() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  // チェックアウト結果のフィードバック（URL params処理、データfetchではない）
  useEffect(() => {
    const success = searchParams.get('success');
    const canceled = searchParams.get('canceled');

    if (success === 'true') {
      toast.success(t('settings.subscription.checkoutSuccess'));
      router.replace('/settings/subscription', { scroll: false });
    } else if (canceled === 'true') {
      toast.info(t('settings.subscription.checkoutCanceled'));
      router.replace('/settings/subscription', { scroll: false });
    }
  }, [searchParams, router, t]);

  // 統合エンドポイントで一括取得（N+1 解消）
  const overview = api.billing.getOverview.useQuery(undefined, {
    retry: false,
  });

  const subscriptionStatus = overview.data?.billingInfo.subscriptionStatus;
  const currentPlan =
    subscriptionStatus === 'active' ||
    subscriptionStatus === 'trialing' ||
    subscriptionStatus === 'past_due'
      ? 'pro'
      : 'free';

  // Checkout Session 作成
  const createCheckout = api.billing.createCheckoutSession.useMutation({
    onSuccess(data) {
      window.location.href = data.url;
    },
    onError(error) {
      toast.error(error.message);
    },
  });

  // Portal Session 作成
  const createPortal = api.billing.createPortalSession.useMutation({
    onSuccess(data) {
      window.location.href = data.url;
    },
    onError(error) {
      toast.error(error.message);
    },
  });

  const handleUpgrade = useCallback(() => {
    if (!STRIPE_PRICE_ID) {
      toast.error(t('settings.subscription.stripeNotConfigured'));
      return;
    }
    createCheckout.mutate({ priceId: STRIPE_PRICE_ID });
  }, [createCheckout, t]);

  const handleManageSubscription = useCallback(() => {
    createPortal.mutate();
  }, [createPortal]);

  const handleCancelConfirm = useCallback(() => {
    setCancelDialogOpen(false);
    createPortal.mutate();
  }, [createPortal]);

  // Intl フォーマッターをメモ化
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    [],
  );

  const formatCurrency = useCallback((amount: number, currency: string) => {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(amount);
  }, []);

  const isStripeConfigured = STRIPE_PRICE_ID !== '';
  const isMutating = createCheckout.isPending || createPortal.isPending;

  // ローディング状態（P0-2）
  if (overview.isLoading) {
    return (
      <div className="space-y-6 sm:space-y-8">
        {[0, 1].map((i) => (
          <SectionCard key={i}>
            <div className="space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </SectionCard>
        ))}
      </div>
    );
  }

  // エラー状態（P1-6）
  if (overview.isError) {
    return (
      <div className="space-y-6 sm:space-y-8">
        <SectionCard>
          <div className="flex flex-col items-center gap-4 py-8">
            <AlertTriangle className="text-muted-foreground h-8 w-8" />
            <p className="text-muted-foreground text-sm">{t('settings.subscription.loadError')}</p>
            <Button variant="outline" onClick={() => overview.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('settings.subscription.retry')}
            </Button>
          </div>
        </SectionCard>
      </div>
    );
  }

  const paymentMethodData = overview.data?.paymentMethod;
  const invoicesData = overview.data?.invoices ?? [];

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* 現在のプラン */}
      <SectionCard title={t('settings.subscription.currentPlan')}>
        <div className="flex items-center gap-4 py-2">
          <div className="bg-state-active flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
            <Zap className="text-primary h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-lg font-bold">
                {currentPlan === 'pro'
                  ? t('settings.subscription.plans.pro.name')
                  : t('settings.subscription.freePlanLabel')}
              </h4>
              <Badge variant="secondary">{t('settings.subscription.currentBadge')}</Badge>
              {subscriptionStatus === 'trialing' && (
                <Badge variant="outline">{t('settings.subscription.trialBadge')}</Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              {subscriptionStatus === 'trialing'
                ? t('settings.subscription.trialDescription')
                : currentPlan === 'pro'
                  ? t('settings.subscription.proPlanDescription')
                  : t('settings.subscription.freePlanDescription')}
            </p>
          </div>
          {currentPlan === 'pro' && (
            <Button
              variant="outline"
              onClick={handleManageSubscription}
              disabled={isMutating}
              className="shrink-0"
            >
              {t('settings.subscription.adjustPlan')}
            </Button>
          )}
        </div>
      </SectionCard>

      {/* 支払い失敗警告（past_due 時のみ） */}
      {subscriptionStatus === 'past_due' && (
        <SectionCard>
          <div className="bg-warning-tint flex items-center gap-3 rounded-lg p-4">
            <AlertTriangle className="text-warning h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t('settings.subscription.pastDueTitle')}</p>
              <p className="text-muted-foreground text-sm">
                {t('settings.subscription.pastDueDescription')}
              </p>
            </div>
            <Button
              variant="outline"
              className="ml-auto shrink-0"
              onClick={handleManageSubscription}
              disabled={isMutating}
            >
              {t('settings.subscription.updatePayment')}
            </Button>
          </div>
        </SectionCard>
      )}

      {/* キャンセル済み通知（canceled 時のみ） */}
      {subscriptionStatus === 'canceled' && (
        <SectionCard>
          <div className="flex items-center gap-3 rounded-lg p-4">
            <AlertTriangle className="text-muted-foreground h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t('settings.subscription.canceledTitle')}</p>
              <p className="text-muted-foreground text-sm">
                {t('settings.subscription.canceledDescription')}
              </p>
            </div>
            <Button
              variant="primary"
              className="ml-auto shrink-0"
              disabled={!isStripeConfigured || isMutating}
              onClick={handleUpgrade}
            >
              {isMutating
                ? t('settings.subscription.processing')
                : t('settings.subscription.resubscribe')}
            </Button>
          </div>
        </SectionCard>
      )}

      {/* プラン変更（Free ユーザーのみ — canceled は上で専用UIを表示） */}
      {currentPlan === 'free' && subscriptionStatus !== 'canceled' && (
        <SectionCard title={t('settings.subscription.selectPlan')}>
          <div className="grid gap-4 md:grid-cols-2">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={cn(
                  'border-border relative rounded-2xl border p-4',
                  plan.recommended && 'border-primary ring-state-active ring-2',
                  currentPlan === plan.id && 'bg-container',
                )}
              >
                {plan.recommended && (
                  <Badge className="absolute -top-2 left-1/2 -translate-x-1/2">
                    <Sparkles className="mr-1 h-3 w-3" />
                    {t('settings.subscription.recommended')}
                  </Badge>
                )}

                <div className="mb-4">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold">{t(plan.nameKey)}</h4>
                  </div>
                  <div className="mt-2">
                    <span className="text-2xl font-bold">
                      {new Intl.NumberFormat(undefined, {
                        style: 'currency',
                        currency: 'usd',
                      }).format(plan.price)}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {t('settings.subscription.perMonth')}
                    </span>
                  </div>
                </div>

                <ul className="mb-4 space-y-2">
                  {plan.featureKeys.map((featureKey) => (
                    <li key={featureKey} className="flex items-center gap-2 text-sm">
                      <Check className="text-primary h-4 w-4 flex-shrink-0" />
                      <span>{t(featureKey)}</span>
                    </li>
                  ))}
                </ul>

                {plan.id === 'pro' ? (
                  <Button
                    className="w-full"
                    variant="primary"
                    disabled={!isStripeConfigured || isMutating}
                    onClick={handleUpgrade}
                  >
                    {isMutating
                      ? t('settings.subscription.processing')
                      : t('settings.subscription.upgrade')}
                  </Button>
                ) : (
                  <Button className="w-full" variant="ghost" disabled>
                    {t('settings.subscription.inUse')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* お支払い方法（Pro ユーザーのみ表示） */}
      {currentPlan === 'pro' && (
        <SectionCard title={t('settings.subscription.paymentMethod')}>
          <LabeledRow
            label={
              paymentMethodData ? (
                <span className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  <span className="capitalize">{paymentMethodData.brand}</span>
                  {' •••• '}
                  {paymentMethodData.last4}
                  <span className="text-muted-foreground text-xs">
                    {String(paymentMethodData.expMonth).padStart(2, '0')}/
                    {paymentMethodData.expYear}
                  </span>
                </span>
              ) : (
                t('settings.subscription.noCard')
              )
            }
          >
            <Button variant="outline" onClick={handleManageSubscription} disabled={isMutating}>
              {t('settings.subscription.updateCard')}
            </Button>
          </LabeledRow>
        </SectionCard>
      )}

      {/* 請求履歴 — overflow-x-auto でモバイル対応（P1-5） */}
      {currentPlan === 'pro' && (
        <SectionCard title={t('settings.subscription.billingHistory')}>
          {invoicesData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-muted-foreground text-left text-xs">
                    <th className="pb-2 font-medium">{t('settings.subscription.invoiceDate')}</th>
                    <th className="pb-2 font-medium">{t('settings.subscription.invoiceTotal')}</th>
                    <th className="pb-2 font-medium">{t('settings.subscription.invoiceStatus')}</th>
                    <th className="pb-2 text-right font-medium">
                      {t('settings.subscription.invoiceAction')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoicesData.map((invoice) => (
                    <tr key={invoice.id} className="text-sm">
                      <td className="py-3 whitespace-nowrap">
                        {dateFormatter.format(new Date(invoice.date))}
                      </td>
                      <td className="py-3 whitespace-nowrap">
                        {formatCurrency(invoice.amount / 100, invoice.currency)}
                      </td>
                      <td className="py-3">
                        <Badge variant="secondary">
                          {invoice.status === 'paid'
                            ? t('settings.subscription.invoicePaid')
                            : invoice.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-right">
                        {invoice.hostedInvoiceUrl && (
                          <a
                            href={invoice.hostedInvoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary text-sm hover:underline"
                          >
                            {t('settings.subscription.invoiceView')}
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {t('settings.subscription.noInvoices')}
            </p>
          )}
        </SectionCard>
      )}

      {/* キャンセル — 確認ダイアログ付き（P0-1） */}
      {currentPlan === 'pro' && (
        <SectionCard title={t('settings.subscription.cancelTitle')}>
          <LabeledRow label={t('settings.subscription.cancelDescription')}>
            <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isMutating}>
                  {t('settings.subscription.cancelButton')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t('settings.subscription.cancelConfirmTitle')}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('settings.subscription.cancelConfirmDescription')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>
                    {t('settings.subscription.cancelConfirmCancel')}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleCancelConfirm}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive-hover"
                  >
                    {t('settings.subscription.cancelConfirmAction')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </LabeledRow>
        </SectionCard>
      )}
    </div>
  );
}
