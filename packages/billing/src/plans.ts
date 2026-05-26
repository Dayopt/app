export const dayoptPlanIds = {
  free: 'free',
  pro: 'pro',
} as const;

export type DayoptPlanId = (typeof dayoptPlanIds)[keyof typeof dayoptPlanIds];

export type DayoptPlan = Readonly<{
  id: DayoptPlanId;
  name: string;
}>;

export const dayoptPlans = {
  free: {
    id: dayoptPlanIds.free,
    name: 'Free',
  },
  pro: {
    id: dayoptPlanIds.pro,
    name: 'Pro',
  },
} as const satisfies Record<DayoptPlanId, DayoptPlan>;

export function isPaidPlan(planId: DayoptPlanId): boolean {
  return planId === dayoptPlanIds.pro;
}
