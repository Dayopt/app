import type { DayoptPlanId } from './plans';

export const entitlementKeys = {
  proAccess: 'pro_access',
} as const;

export type EntitlementKey = (typeof entitlementKeys)[keyof typeof entitlementKeys];

export const planEntitlements = {
  free: [],
  pro: [entitlementKeys.proAccess],
} as const satisfies Record<DayoptPlanId, readonly EntitlementKey[]>;

export function canUseEntitlement(planId: DayoptPlanId, entitlement: EntitlementKey): boolean {
  return (planEntitlements[planId] as readonly EntitlementKey[]).includes(entitlement);
}
