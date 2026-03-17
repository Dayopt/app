'use client';

import { useCallback, useState } from 'react';

import { Check, CreditCard, ExternalLink, Receipt, Sparkles, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { api } from '@/platform/trpc';

import { LabeledRow } from '@/components/common/LabeledRow';
import { SectionCard } from '@/components/common/SectionCard';

interface Plan {
  id: string;
  nameKey: string;
  price: number;
  period: 'month' | 'year';
  featureKeys: string[];
  recommended?: boolean;
}

const PLANS: Plan[] = [
  {
    id: 'free',
    nameKey: 'settings.subscription.plans.free.name',
    price: 0,
    period: 'month',
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
    period: 'month',
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

export function BillingSettings() {
  const t = useTranslations();
  const [billingPeriod, setBillingPeriod] = useState<'month' | 'year'>('month');

  // 課金情報の取得
  const billingInfo = api.billing.getInfo.useQuery(undefined, {
    retry: false,
  });

  const currentPlan =
    billingInfo.data?.subscriptionStatus === 'active' ||
    billingInfo.data?.subscriptionStatus === 'trialing'
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
      toast.error('Stripe is not configured yet');
      return;
    }
    createCheckout.mutate({ priceId: STRIPE_PRICE_ID });
  }, [createCheckout]);

  const handleManageSubscription = useCallback(() => {
    createPortal.mutate();
  }, [createPortal]);

  const handlePeriodChange = useCallback((period: 'month' | 'year') => {
    setBillingPeriod(period);
  }, []);

  const isStripeConfigured = STRIPE_PRICE_ID !== '';
  const isLoading = createCheckout.isPending || createPortal.isPending;

  return (
    <div className="space-y-8">
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
            </div>
            <p className="text-muted-foreground text-sm">
              {currentPlan === 'pro'
                ? t('settings.subscription.proPlanDescription')
                : t('settings.subscription.freePlanDescription')}
            </p>
          </div>
        </div>
      </SectionCard>

      {/* プラン変更 */}
      <SectionCard
        title={t('settings.subscription.selectPlan')}
        actions={
          <div className="bg-surface-inset flex gap-1 rounded-2xl p-1">
            <Button
              variant={billingPeriod === 'month' ? 'primary' : 'ghost'}
              onClick={() => handlePeriodChange('month')}
            >
              {t('settings.subscription.monthly')}
            </Button>
            <Button
              variant={billingPeriod === 'year' ? 'primary' : 'ghost'}
              onClick={() => handlePeriodChange('year')}
            >
              {t('settings.subscription.yearly')}
              <Badge variant="secondary" className="ml-2">
                {t('settings.subscription.yearlyDiscount')}
              </Badge>
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                'border-border relative rounded-2xl border p-4',
                plan.recommended && 'border-primary ring-primary/20 ring-2',
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
                    ${billingPeriod === 'year' ? Math.floor(plan.price * 0.8) : plan.price}
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

              {plan.id === 'pro' && currentPlan !== 'pro' ? (
                <Button
                  className="w-full"
                  variant="primary"
                  disabled={!isStripeConfigured || isLoading}
                  onClick={handleUpgrade}
                >
                  {isLoading
                    ? t('settings.subscription.processing')
                    : t('settings.subscription.upgrade')}
                </Button>
              ) : plan.id === 'pro' && currentPlan === 'pro' ? (
                <Button
                  className="w-full"
                  variant="ghost"
                  onClick={handleManageSubscription}
                  disabled={isLoading}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t('settings.subscription.managePlan')}
                </Button>
              ) : (
                <Button className="w-full" variant="ghost" disabled>
                  {currentPlan === plan.id
                    ? t('settings.subscription.inUse')
                    : t('settings.subscription.upgrade')}
                </Button>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      {/* お支払い方法（Pro ユーザーのみ表示） */}
      {currentPlan === 'pro' && (
        <SectionCard title={t('settings.subscription.paymentMethod')}>
          <LabeledRow label={t('settings.subscription.managePayment')}>
            <Button variant="outline" onClick={handleManageSubscription} disabled={isLoading}>
              <CreditCard className="mr-2 h-4 w-4" />
              {t('settings.subscription.managePlan')}
            </Button>
          </LabeledRow>
        </SectionCard>
      )}

      {/* 請求履歴・領収書 */}
      {currentPlan === 'pro' && (
        <SectionCard title={t('settings.subscription.billingHistory')}>
          <div className="flex h-32 flex-col items-center justify-center">
            <Receipt className="text-muted-foreground mb-2 h-8 w-8" />
            <p className="text-muted-foreground mb-2 text-sm">
              {t('settings.subscription.viewInStripe')}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleManageSubscription}
              disabled={isLoading}
            >
              <ExternalLink className="mr-2 h-3 w-3" />
              {t('settings.subscription.openPortal')}
            </Button>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
