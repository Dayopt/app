import { beforeEach, describe, expect, it, vi } from 'vitest';

const maybeSingle = vi.hoisted(() => vi.fn());
const listSubscriptions = vi.hoisted(() => vi.fn());
const cancelSubscription = vi.hoisted(() => vi.fn());
const deleteCustomer = vi.hoisted(() => vi.fn());

vi.mock('@/env', () => ({ env: {} }));
vi.mock('@/lib/supabase/oauth', () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
    }),
  }),
}));
vi.mock('@/lib/stripe/client', () => ({
  getStripe: () => ({
    customers: { del: deleteCustomer },
    subscriptions: {
      cancel: cancelSubscription,
      list: listSubscriptions,
    },
  }),
}));

import { deleteLegacyBillingAccountData } from '../account-deletion';

describe('deleteLegacyBillingAccountData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingle.mockResolvedValue({
      data: { stripe_customer_id: 'cus_legacy' },
      error: null,
    });
    listSubscriptions.mockResolvedValue({
      data: [
        { id: 'sub_active', status: 'active' },
        { id: 'sub_canceled', status: 'canceled' },
      ],
    });
    cancelSubscription.mockResolvedValue(undefined);
    deleteCustomer.mockResolvedValue({ deleted: true, id: 'cus_legacy' });
  });

  it('activation前の既存Stripe削除順をsettings境界で維持する', async () => {
    await expect(deleteLegacyBillingAccountData('user-1')).resolves.toBeUndefined();

    expect(listSubscriptions).toHaveBeenCalledWith({ customer: 'cus_legacy' });
    expect(cancelSubscription).toHaveBeenCalledWith('sub_active');
    expect(cancelSubscription).not.toHaveBeenCalledWith('sub_canceled');
    expect(deleteCustomer).toHaveBeenCalledWith('cus_legacy');
  });

  it('Customerが無い場合はproviderを呼ばない', async () => {
    maybeSingle.mockResolvedValue({
      data: { stripe_customer_id: null },
      error: null,
    });

    await expect(deleteLegacyBillingAccountData('user-1')).resolves.toBeUndefined();
    expect(listSubscriptions).not.toHaveBeenCalled();
    expect(deleteCustomer).not.toHaveBeenCalled();
  });
});
