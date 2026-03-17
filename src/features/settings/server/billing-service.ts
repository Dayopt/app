/**
 * Billing Service
 *
 * Stripe連携のビジネスロジック層。
 * Router → Service → Stripe/Supabase の3層構造に準拠。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

import { getAppUrl } from '@/lib/app-url';
import type { Database } from '@/lib/database.types';
import { logger } from '@/lib/logger';
import { requireStripe } from '@/platform/stripe/client';
import { ServiceError } from '@/platform/trpc/errors';

// ===== Types =====

export type SubscriptionStatus = 'free' | 'active' | 'past_due' | 'canceled' | 'trialing';

export interface BillingInfo {
  subscriptionStatus: SubscriptionStatus;
  stripeCustomerId: string | null;
  subscriptionId: string | null;
}

export interface PaymentMethod {
  brand: string; // visa, mastercard, amex, etc.
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface InvoiceItem {
  id: string;
  date: string; // ISO 8601
  amount: number; // cents
  currency: string;
  status: string;
  hostedInvoiceUrl: string | null;
}

// ===== Error Codes =====

export class BillingServiceError extends ServiceError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'BillingServiceError';
  }
}

// ===== Service =====

/**
 * ユーザーの課金情報を取得
 */
export async function getBillingInfo(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<BillingInfo> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();

  if (error) {
    logger.error('Failed to fetch billing info', { userId, error });
    throw new BillingServiceError('FETCH_FAILED', 'Failed to fetch billing info');
  }

  // profiles型にはstripe系カラムが未反映のため Record 経由で取得
  const profile = data as Record<string, unknown>;

  return {
    subscriptionStatus: (profile.subscription_status as SubscriptionStatus) ?? 'free',
    stripeCustomerId: (profile.stripe_customer_id as string) ?? null,
    subscriptionId: (profile.subscription_id as string) ?? null,
  };
}

/**
 * Stripe Customer を取得または作成
 */
async function getOrCreateCustomer(
  stripe: Stripe,
  supabase: SupabaseClient<Database>,
  userId: string,
  email: string,
): Promise<string> {
  // 既存の customer_id を確認
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();

  const existingCustomerId = (data as Record<string, unknown> | null)?.stripe_customer_id as
    | string
    | null;

  if (existingCustomerId) {
    return existingCustomerId;
  }

  // Stripe Customer 作成
  const customer = await stripe.customers.create({
    email,
    metadata: {
      supabase_user_id: userId,
    },
  });

  // profiles に保存
  const { error } = await supabase
    .from('profiles')
    .update({ stripe_customer_id: customer.id } as never)
    .eq('id', userId);

  if (error) {
    logger.error('Failed to save stripe_customer_id', { userId, error });
    throw new BillingServiceError('UPDATE_FAILED', 'Failed to save Stripe customer');
  }

  return customer.id;
}

/**
 * Stripe Checkout Session を作成
 */
export async function createCheckoutSession(
  supabase: SupabaseClient<Database>,
  userId: string,
  email: string,
  priceId: string,
): Promise<string> {
  const stripe = requireStripe();
  const customerId = await getOrCreateCustomer(stripe, supabase, userId, email);

  const appUrl = getAppUrl();

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 7,
    },
    success_url: `${appUrl}/settings/subscription?success=true`,
    cancel_url: `${appUrl}/settings/subscription?canceled=true`,
    metadata: {
      supabase_user_id: userId,
    },
  });

  if (!session.url) {
    throw new BillingServiceError('CREATE_FAILED', 'Failed to create checkout session');
  }

  return session.url;
}

/**
 * Stripe Customer Portal Session を作成
 */
export async function createPortalSession(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  const stripe = requireStripe();

  const billingInfo = await getBillingInfo(supabase, userId);

  if (!billingInfo.stripeCustomerId) {
    throw new BillingServiceError('NOT_FOUND', 'No Stripe customer found. Subscribe to Pro first.');
  }

  const appUrl = getAppUrl();

  const session = await stripe.billingPortal.sessions.create({
    customer: billingInfo.stripeCustomerId,
    return_url: `${appUrl}/settings/subscription`,
  });

  return session.url;
}

/**
 * デフォルト支払い方法を取得
 */
export async function getPaymentMethod(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<PaymentMethod | null> {
  const stripe = requireStripe();
  const billingInfo = await getBillingInfo(supabase, userId);

  if (!billingInfo.stripeCustomerId) {
    return null;
  }

  const customer = await stripe.customers.retrieve(billingInfo.stripeCustomerId);

  if (customer.deleted) {
    return null;
  }

  const defaultPaymentMethodId =
    typeof customer.invoice_settings?.default_payment_method === 'string'
      ? customer.invoice_settings.default_payment_method
      : customer.invoice_settings?.default_payment_method?.id;

  if (!defaultPaymentMethodId) {
    return null;
  }

  const pm = await stripe.paymentMethods.retrieve(defaultPaymentMethodId);

  if (!pm.card) {
    return null;
  }

  return {
    brand: pm.card.brand,
    last4: pm.card.last4,
    expMonth: pm.card.exp_month,
    expYear: pm.card.exp_year,
  };
}

/**
 * 請求書一覧を取得（最新10件）
 */
export async function getInvoices(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<InvoiceItem[]> {
  const stripe = requireStripe();
  const billingInfo = await getBillingInfo(supabase, userId);

  if (!billingInfo.stripeCustomerId) {
    return [];
  }

  const invoices = await stripe.invoices.list({
    customer: billingInfo.stripeCustomerId,
    limit: 10,
  });

  return invoices.data.map((inv) => ({
    id: inv.id,
    date: new Date((inv.created ?? 0) * 1000).toISOString(),
    amount: inv.amount_paid ?? 0,
    currency: inv.currency ?? 'usd',
    status: inv.status ?? 'unknown',
    hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
  }));
}

/**
 * Webhook: サブスクリプションステータスを同期
 *
 * createServiceRoleClient() 経由の supabase を使用すること（RLSバイパス）
 */
export async function syncSubscriptionStatus(
  supabase: SupabaseClient<Database>,
  stripeCustomerId: string,
  subscriptionId: string | null,
  status: SubscriptionStatus,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      subscription_status: status,
      subscription_id: subscriptionId,
    } as never)
    .eq('stripe_customer_id' as never, stripeCustomerId);

  if (error) {
    logger.error('Failed to sync subscription status', { stripeCustomerId, status, error });
    throw new BillingServiceError('UPDATE_FAILED', 'Failed to sync subscription status');
  }

  logger.info('Subscription status synced', { stripeCustomerId, status });
}
