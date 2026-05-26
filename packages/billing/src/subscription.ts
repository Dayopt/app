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
