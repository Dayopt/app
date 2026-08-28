import { beforeEach, describe, expect, it, vi } from 'vitest';

const durableCheckout = vi.hoisted(() => vi.fn());
const durablePortal = vi.hoisted(() => vi.fn());
const checkoutCreate = vi.hoisted(() => vi.fn());
const portalCreate = vi.hoisted(() => vi.fn());
const subscriptionList = vi.hoisted(() => vi.fn());
const requireStripe = vi.hoisted(() =>
  vi.fn(() => ({
    billingPortal: { sessions: { create: portalCreate } },
    checkout: { sessions: { create: checkoutCreate } },
    subscriptions: { list: subscriptionList },
  })),
);

vi.mock('@/env', () => ({
  env: {
    NEXT_PUBLIC_STRIPE_PRO_PRICE_ID: 'price_dayopt',
  },
}));
vi.mock('@/lib/app-url', () => ({ getAppUrl: () => 'https://app.dayopt.test' }));
vi.mock('@/lib/stripe/client', () => ({ requireStripe }));
vi.mock('./billing-mutation-service', () => ({
  createCheckoutSession: durableCheckout,
  createPortalSession: durablePortal,
}));

import { createCheckoutSession, createPortalSession } from './billing-service';

const OPERATION_ID = '00000000-0000-4000-8000-000000000001';

function database(
  versionResult: { data: number | null; error: { code?: string } | null },
  activated = false,
) {
  const single = vi.fn(async () => ({
    data: { stripe_customer_id: 'cus_existing' },
    error: null,
  }));
  const updateEq = vi.fn(async () => ({ error: null }));
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ single })),
    })),
    update: vi.fn(() => ({ eq: updateEq })),
  }));
  return {
    client: {
      from,
      rpc: vi.fn((operation: string) => {
        if (operation === 'get_external_lifecycle_app_version_v2') {
          return { abortSignal: vi.fn(async () => versionResult) };
        }
        return Promise.resolve({
          data: [{ activated, active_operations: 0 }],
          error: null,
        });
      }),
    } as never,
    from,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  checkoutCreate.mockResolvedValue({
    id: 'cs_test',
    url: 'https://checkout.stripe.com/session',
  });
  portalCreate.mockResolvedValue({
    id: 'bps_test',
    url: 'https://billing.stripe.com/session',
  });
  subscriptionList.mockResolvedValue({ data: [] });
  durableCheckout.mockResolvedValue('https://checkout.stripe.com/durable');
  durablePortal.mockResolvedValue('https://billing.stripe.com/durable');
});

describe('billing lifecycle compatibility', () => {
  it('terminal schemaかつactivation後はdurable Checkoutだけを使う', async () => {
    const { client } = database({ data: 1, error: null }, true);

    await expect(
      createCheckoutSession(client, 'user-1', 'user@example.com', OPERATION_ID),
    ).resolves.toBe('https://checkout.stripe.com/durable');
    expect(durableCheckout).toHaveBeenCalledWith(
      client,
      'user-1',
      'user@example.com',
      OPERATION_ID,
    );
    expect(requireStripe).not.toHaveBeenCalled();
  });

  it('terminal schemaでもactivation前は現行Checkoutを維持する', async () => {
    const { client } = database({ data: 1, error: null });

    await expect(
      createCheckoutSession(client, 'user-1', 'user@example.com', OPERATION_ID),
    ).resolves.toBe('https://checkout.stripe.com/session');
    expect(durableCheckout).not.toHaveBeenCalled();
  });

  it('旧DBでは現行Checkoutをoperation単位で再送する', async () => {
    const { client } = database({ data: null, error: { code: 'PGRST202' } });

    await expect(
      createCheckoutSession(client, 'user-1', 'user@example.com', OPERATION_ID),
    ).resolves.toBe('https://checkout.stripe.com/session');
    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_existing', mode: 'subscription' }),
      { idempotencyKey: `dayopt-billing-checkout-legacy-v1-${OPERATION_ID}` },
    );
    expect(durableCheckout).not.toHaveBeenCalled();
  });

  it('旧DBではPortalもoperation単位の現行経路を使う', async () => {
    const { client } = database({ data: null, error: { code: '42883' } });

    await expect(createPortalSession(client, 'user-1', OPERATION_ID)).resolves.toBe(
      'https://billing.stripe.com/session',
    );
    expect(portalCreate).toHaveBeenCalledWith(
      {
        customer: 'cus_existing',
        return_url: 'https://app.dayopt.test/settings/billing?portal_return=true',
      },
      { idempotencyKey: `dayopt-billing-portal-legacy-v1-${OPERATION_ID}` },
    );
    expect(durablePortal).not.toHaveBeenCalled();
  });

  it('未知のschema errorではStripeを呼ばない', async () => {
    const { client } = database({ data: null, error: { code: '42501' } });

    await expect(
      createCheckoutSession(client, 'user-1', 'user@example.com', OPERATION_ID),
    ).rejects.toThrow('External lifecycle schema version could not be verified');
    expect(requireStripe).not.toHaveBeenCalled();
    expect(durableCheckout).not.toHaveBeenCalled();
  });
});
