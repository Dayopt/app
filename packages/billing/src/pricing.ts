import { dayoptPlanIds, type DayoptPlanId } from './plans';

export const dayoptProTrialDays = 7;

export type DayoptPlanPricing = Readonly<{
  monthlyUsdCents: number;
  displayPrice: string;
  displayPeriod: string;
}>;

export const dayoptPricing = {
  free: {
    monthlyUsdCents: 0,
    displayPrice: '$0',
    displayPeriod: '',
  },
  pro: {
    monthlyUsdCents: 500,
    displayPrice: '$5',
    displayPeriod: '/month',
  },
} as const satisfies Record<DayoptPlanId, DayoptPlanPricing>;

export function getMonthlyUsdCents(planId: DayoptPlanId): number {
  return dayoptPricing[planId].monthlyUsdCents;
}

export function getMonthlyUsd(planId: DayoptPlanId): number {
  return getMonthlyUsdCents(planId) / 100;
}

export const freeMonthlyUsd = getMonthlyUsd(dayoptPlanIds.free);
export const proMonthlyUsd = getMonthlyUsd(dayoptPlanIds.pro);
