import { describe, expect, it } from 'vitest';

import { canUseEntitlement, entitlementKeys, planEntitlements } from './entitlement';

const allKeys = Object.values(entitlementKeys);

describe('canUseEntitlement', () => {
  it.each(allKeys)('free は %s を持たない', (key) => {
    expect(canUseEntitlement('free', key)).toBe(false);
  });

  it.each(allKeys)('pro は %s を持つ', (key) => {
    expect(canUseEntitlement('pro', key)).toBe(true);
  });
});

describe('planEntitlements', () => {
  // 5 個目のキーを plan の割り当てを決めないまま足せないようにする guard。
  // 追加したキーは free / pro のどちらに置くかを epic #2610 §方針 の表で決める。
  it('pro は entitlement key を網羅する', () => {
    expect([...planEntitlements.pro].sort()).toEqual([...allKeys].sort());
  });

  it('free は 1 つも entitlement を持たない', () => {
    expect(planEntitlements.free).toHaveLength(0);
  });
});
