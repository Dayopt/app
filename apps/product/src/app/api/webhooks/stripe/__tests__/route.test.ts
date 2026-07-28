import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => ({
  RESEND_API_KEY: undefined,
  RESEND_FROM_EMAIL: undefined,
  SLACK_BILLING_WEBHOOK_URL: undefined,
  STRIPE_ACCOUNT_ID: 'acct_dayopt',
  STRIPE_LIVEMODE: 'false',
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
}));
const eventMock = vi.hoisted(() => ({
  account: null as string | null,
  created: 1_700_000_000,
  data: {
    object: {
      customer: 'cus_test123',
      id: 'sub_test456',
    },
  },
  id: 'evt_test123',
  livemode: false,
  type: 'customer.subscription.deleted',
}));
const constructEvent = vi.hoisted(() => vi.fn(() => eventMock));
const retrieveAccount = vi.hoisted(() => vi.fn());
const retrieveEvent = vi.hoisted(() => vi.fn());
const syncDeletedSubscriptionStatus = vi.hoisted(() => vi.fn());
const syncSubscriptionStatus = vi.hoisted(() => vi.fn());
const claimStripeWebhookEvent = vi.hoisted(() => vi.fn());
const markStripeWebhookEventProcessed = vi.hoisted(() => vi.fn());
const releaseStripeWebhookEvent = vi.hoisted(() => vi.fn());
const profileMaybeSingle = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() =>
  vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: profileMaybeSingle,
      })),
    })),
  })),
);

vi.mock('@/env', () => ({ env: envMock }));
vi.mock('@/lib/app-url', () => ({ getAppUrl: () => 'https://app.dayopt.test' }));
vi.mock('@/lib/stripe/client', () => ({
  requireStripe: () => ({
    accounts: { retrieve: retrieveAccount },
    events: { retrieve: retrieveEvent },
    webhooks: { constructEvent },
  }),
}));
vi.mock('@/lib/supabase/oauth', () => ({
  createServiceRoleClient: () => ({
    auth: { admin: { getUserById: vi.fn() } },
    from,
  }),
}));
vi.mock('@/features/settings/server/billing-service', () => ({
  syncDeletedSubscriptionStatus,
  syncSubscriptionStatus,
}));
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock('@/lib/sentry', () => ({
  captureUnexpectedDatabaseError: vi.fn(),
  captureUnexpectedError: vi.fn(),
  observeAuthOperation: vi.fn(),
}));
vi.mock('../stripe-webhook-idempotency', () => ({
  claimStripeWebhookEvent,
  markStripeWebhookEventProcessed,
  releaseStripeWebhookEvent,
}));

import { POST } from '../route';

function request(): NextRequest {
  return new NextRequest('https://app.dayopt.test/api/webhooks/stripe', {
    body: '{}',
    headers: { 'stripe-signature': 'signed' },
    method: 'POST',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  eventMock.account = null;
  eventMock.livemode = false;
  retrieveAccount.mockResolvedValue({ id: 'acct_dayopt' });
  retrieveEvent.mockImplementation(async () => ({ ...eventMock }));
  claimStripeWebhookEvent.mockResolvedValue('claimed');
  markStripeWebhookEventProcessed.mockResolvedValue(undefined);
  releaseStripeWebhookEvent.mockResolvedValue(undefined);
  profileMaybeSingle.mockResolvedValue({ data: null, error: null });
});

describe('Stripe webhook route', () => {
  it.each([
    'account_deleted',
    'account_deleting',
    'already_terminal',
    'stale_subscription',
  ] as const)('%sは通知せずterminal eventとして処理する', async (outcome) => {
    syncDeletedSubscriptionStatus.mockResolvedValue(outcome);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(syncDeletedSubscriptionStatus).toHaveBeenCalledWith(
      expect.anything(),
      'cus_test123',
      'sub_test456',
    );
    expect(from).not.toHaveBeenCalled();
    expect(markStripeWebhookEventProcessed).toHaveBeenCalledWith(expect.anything(), 'evt_test123');
    expect(releaseStripeWebhookEvent).not.toHaveBeenCalled();
  });

  it('unknown Customerはclaimを解放してretry可能な500を返す', async () => {
    syncDeletedSubscriptionStatus.mockRejectedValue(
      new Error('No live or deleted billing account matched'),
    );

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(markStripeWebhookEventProcessed).not.toHaveBeenCalled();
    expect(releaseStripeWebhookEvent).toHaveBeenCalledWith(expect.anything(), 'evt_test123');
  });

  it('照合後の業務入力をprovider Eventへ固定する', async () => {
    retrieveEvent.mockResolvedValue({
      ...eventMock,
      data: {
        object: {
          customer: 'cus_provider123',
          id: 'sub_provider456',
        },
      },
    });
    syncDeletedSubscriptionStatus.mockResolvedValue('account_deleted');

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(syncDeletedSubscriptionStatus).toHaveBeenCalledWith(
      expect.anything(),
      'cus_provider123',
      'sub_provider456',
    );
    expect(syncDeletedSubscriptionStatus).not.toHaveBeenCalledWith(
      expect.anything(),
      'cus_test123',
      'sub_test456',
    );
  });

  it('event mode不一致はDB claim前に拒否する', async () => {
    eventMock.livemode = true;

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(claimStripeWebhookEvent).not.toHaveBeenCalled();
    expect(syncDeletedSubscriptionStatus).not.toHaveBeenCalled();
  });

  it('event account不一致はDB claim前に拒否する', async () => {
    eventMock.account = 'acct_other';

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(claimStripeWebhookEvent).not.toHaveBeenCalled();
    expect(syncDeletedSubscriptionStatus).not.toHaveBeenCalled();
  });

  it('API keyのaccount不一致はplatform eventでもDB claim前に拒否する', async () => {
    retrieveAccount.mockResolvedValue({ id: 'acct_other' });

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(retrieveEvent).toHaveBeenCalledWith('evt_test123', {
      maxNetworkRetries: 0,
      timeout: 5_000,
    });
    expect(claimStripeWebhookEvent).not.toHaveBeenCalled();
    expect(syncDeletedSubscriptionStatus).not.toHaveBeenCalled();
  });

  it('provider Eventを取得できない場合はDB claim前にretry可能な500を返す', async () => {
    retrieveEvent.mockRejectedValue(new Error('provider unavailable'));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(claimStripeWebhookEvent).not.toHaveBeenCalled();
    expect(syncDeletedSubscriptionStatus).not.toHaveBeenCalled();
  });
});
