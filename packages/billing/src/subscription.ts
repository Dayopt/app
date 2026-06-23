import { dayoptPlanIds, type DayoptPlanId } from './plans';

export const subscriptionStatuses = ['free', 'active', 'past_due', 'canceled', 'trialing'] as const;

export type SubscriptionStatus = (typeof subscriptionStatuses)[number];

export const proSubscriptionStatuses = ['active', 'trialing', 'past_due'] as const;

export type ProSubscriptionStatus = (typeof proSubscriptionStatuses)[number];

export function isSubscriptionStatus(
  value: string | null | undefined,
): value is SubscriptionStatus {
  return subscriptionStatuses.includes(value as SubscriptionStatus);
}

export function isProSubscriptionStatus(
  value: string | null | undefined,
): value is ProSubscriptionStatus {
  return proSubscriptionStatuses.includes(value as ProSubscriptionStatus);
}

export function getPlanIdForSubscriptionStatus(status: string | null | undefined): DayoptPlanId {
  return isProSubscriptionStatus(status) ? dayoptPlanIds.pro : dayoptPlanIds.free;
}

/**
 * Stripe subscription status → Dayopt SubscriptionStatus のマッピング。
 * billing model を Stripe SDK 非依存に保つため引数は string（Stripe.Subscription.Status は string 部分型）。
 */
export function mapStripeSubscriptionStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'past_due';
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return 'canceled';
    default:
      // incomplete / paused / 未知の status は Free にフォールバック
      return 'free';
  }
}
