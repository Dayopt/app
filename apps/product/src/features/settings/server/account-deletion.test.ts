import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BillingAccountDeletionError,
  cleanupBillingAccountDeletionTerminalReceipts,
  createBillingAccountDeletionService,
} from './account-deletion';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const OPERATION_ID = '00000000-0000-4000-8000-000000000002';
const CUSTOMER_ID = 'cus_account_delete';
const STRIPE_ACCOUNT_ID = 'acct_dayopt_test';

function liveCustomer(
  id = CUSTOMER_ID,
  metadata: Record<string, string> = { supabase_user_id: USER_ID },
) {
  return { id, livemode: false, metadata };
}

function createStripe() {
  const retrieveAccount = vi.fn().mockResolvedValue({ id: STRIPE_ACCOUNT_ID });
  const retrieveBalance = vi.fn().mockResolvedValue({ livemode: false });
  const listCheckoutSessions = vi.fn();
  const expireCheckoutSession = vi.fn();
  const listSubscriptions = vi.fn();
  const cancelSubscription = vi.fn();
  const retrieveCustomer = vi.fn();
  const searchCustomers = vi.fn();
  const deleteCustomer = vi.fn();

  const stripe = {
    accounts: { retrieve: retrieveAccount },
    balance: { retrieve: retrieveBalance },
    checkout: {
      sessions: {
        expire: expireCheckoutSession,
        list: listCheckoutSessions,
      },
    },
    customers: {
      del: deleteCustomer,
      retrieve: retrieveCustomer,
      search: searchCustomers,
    },
    subscriptions: {
      cancel: cancelSubscription,
      list: listSubscriptions,
    },
  };

  return {
    cancelSubscription,
    deleteCustomer,
    expireCheckoutSession,
    listCheckoutSessions,
    listSubscriptions,
    retrieveAccount,
    retrieveBalance,
    retrieveCustomer,
    searchCustomers,
    service: createBillingAccountDeletionService({
      providerIdentity: { accountId: STRIPE_ACCOUNT_ID, livemode: false },
      stripe: stripe as never,
    }),
  };
}

function createDb(responses: Array<{ data: unknown; error: unknown }>) {
  const queue = [...responses];
  const rpc = vi.fn(() => ({
    abortSignal: vi.fn(async () => {
      const response = queue.shift();
      if (response === undefined) throw new Error('Unexpected RPC');
      return response;
    }),
  }));
  return { db: { rpc } as never, rpc };
}

describe('Billing account deletion service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bound Customerが無ければStripe identityを照合せずnot_presentを返す', async () => {
    const { retrieveAccount, service } = createStripe();

    await expect(
      service.deleteBoundCustomer({ stripeCustomerId: null, userId: USER_ID }),
    ).resolves.toEqual({ providerOutcome: 'not_present' });
    expect(retrieveAccount).not.toHaveBeenCalled();
  });

  it('全pageのopen Checkoutとcancellable subscriptionを閉じてCustomerを検証する', async () => {
    const {
      cancelSubscription,
      deleteCustomer,
      expireCheckoutSession,
      listCheckoutSessions,
      listSubscriptions,
      retrieveAccount,
      retrieveBalance,
      retrieveCustomer,
      service,
    } = createStripe();
    retrieveCustomer
      .mockResolvedValueOnce(liveCustomer())
      .mockResolvedValueOnce({ deleted: true, id: CUSTOMER_ID });
    listCheckoutSessions
      .mockResolvedValueOnce({
        data: [{ id: 'cs_b' }],
        has_more: true,
      })
      .mockResolvedValueOnce({
        data: [{ id: 'cs_a' }],
        has_more: false,
      });
    listSubscriptions
      .mockResolvedValueOnce({
        data: [
          { id: 'sub_c', status: 'paused' },
          { id: 'sub_a', status: 'canceled' },
        ],
        has_more: true,
      })
      .mockResolvedValueOnce({
        data: [{ id: 'sub_b', status: 'active' }],
        has_more: false,
      });
    expireCheckoutSession.mockResolvedValue({});
    cancelSubscription.mockResolvedValue({});
    deleteCustomer.mockResolvedValue({ deleted: true, id: CUSTOMER_ID });

    await expect(
      service.deleteBoundCustomer({ stripeCustomerId: CUSTOMER_ID, userId: USER_ID }),
    ).resolves.toEqual({ providerOutcome: 'deleted' });

    expect(retrieveAccount).toHaveBeenCalledOnce();
    expect(retrieveBalance).toHaveBeenCalledOnce();
    expect(listCheckoutSessions).toHaveBeenNthCalledWith(1, {
      customer: CUSTOMER_ID,
      limit: 100,
      status: 'open',
    });
    expect(listCheckoutSessions).toHaveBeenNthCalledWith(2, {
      customer: CUSTOMER_ID,
      limit: 100,
      starting_after: 'cs_b',
      status: 'open',
    });
    expect(expireCheckoutSession.mock.calls.map(([id]) => id)).toEqual(['cs_a', 'cs_b']);
    expect(expireCheckoutSession).toHaveBeenCalledWith(
      'cs_a',
      {},
      { idempotencyKey: expect.stringMatching(/^dayopt-account-deletion-v2-checkout-/) },
    );
    expect(listSubscriptions).toHaveBeenNthCalledWith(2, {
      customer: CUSTOMER_ID,
      limit: 100,
      starting_after: 'sub_a',
      status: 'all',
    });
    expect(cancelSubscription.mock.calls.map(([id]) => id)).toEqual(['sub_b', 'sub_c']);
    expect(deleteCustomer).toHaveBeenCalledWith(
      CUSTOMER_ID,
      {},
      { idempotencyKey: expect.stringMatching(/^dayopt-account-deletion-v2-customer-/) },
    );
    expect(retrieveCustomer).toHaveBeenCalledTimes(2);
  });

  it('最初のBilling step前にopen Checkoutだけを停止する', async () => {
    const {
      deleteCustomer,
      expireCheckoutSession,
      listCheckoutSessions,
      listSubscriptions,
      retrieveCustomer,
      service,
    } = createStripe();
    retrieveCustomer.mockResolvedValue(liveCustomer());
    listCheckoutSessions.mockResolvedValue({
      data: [{ id: 'cs_open' }],
      has_more: false,
    });
    expireCheckoutSession.mockResolvedValue({});

    await expect(
      service.quiesceBoundCustomer({ stripeCustomerId: CUSTOMER_ID, userId: USER_ID }),
    ).resolves.toBeUndefined();

    expect(expireCheckoutSession).toHaveBeenCalledOnce();
    expect(listSubscriptions).not.toHaveBeenCalled();
    expect(deleteCustomer).not.toHaveBeenCalled();
  });

  it.each([
    {
      configure: (runtime: ReturnType<typeof createStripe>) =>
        runtime.retrieveAccount.mockResolvedValue({ id: 'acct_wrong' }),
      label: 'account',
    },
    {
      configure: (runtime: ReturnType<typeof createStripe>) =>
        runtime.retrieveBalance.mockResolvedValue({ livemode: true }),
      label: 'mode',
    },
  ])('Stripe $label mismatchではproviderとauth側の変更へ進まない', async ({ configure }) => {
    const runtime = createStripe();
    configure(runtime);

    await expect(
      runtime.service.deleteBoundCustomer({
        stripeCustomerId: CUSTOMER_ID,
        userId: USER_ID,
      }),
    ).rejects.toMatchObject({
      code: 'BILLING_ACCOUNT_DELETION_PROVIDER_IDENTITY_FAILED',
    });
    expect(runtime.retrieveCustomer).not.toHaveBeenCalled();
    expect(runtime.deleteCustomer).not.toHaveBeenCalled();
  });

  it('live Customerのuser metadataが違えば削除しない', async () => {
    const { deleteCustomer, retrieveCustomer, service } = createStripe();
    retrieveCustomer.mockResolvedValue(liveCustomer(CUSTOMER_ID, { supabase_user_id: 'foreign' }));

    await expect(
      service.deleteBoundCustomer({ stripeCustomerId: CUSTOMER_ID, userId: USER_ID }),
    ).rejects.toMatchObject({
      code: 'BILLING_ACCOUNT_DELETION_CUSTOMER_OWNERSHIP_FAILED',
    });
    expect(deleteCustomer).not.toHaveBeenCalled();
  });

  it('resource_missingを別accountやmodeの可能性があるためfail closedにする', async () => {
    const { deleteCustomer, listCheckoutSessions, retrieveCustomer, service } = createStripe();
    retrieveCustomer.mockRejectedValue({ code: 'resource_missing' });

    await expect(
      service.deleteBoundCustomer({ stripeCustomerId: CUSTOMER_ID, userId: USER_ID }),
    ).rejects.toBeInstanceOf(BillingAccountDeletionError);
    expect(listCheckoutSessions).not.toHaveBeenCalled();
    expect(deleteCustomer).not.toHaveBeenCalled();
  });

  it('Customer deleteの応答消失後にDeletedCustomerを確認して完了する', async () => {
    const { deleteCustomer, listCheckoutSessions, listSubscriptions, retrieveCustomer, service } =
      createStripe();
    retrieveCustomer
      .mockResolvedValueOnce(liveCustomer())
      .mockResolvedValueOnce({ deleted: true, id: CUSTOMER_ID });
    listCheckoutSessions.mockResolvedValue({ data: [], has_more: false });
    listSubscriptions.mockResolvedValue({ data: [], has_more: false });
    deleteCustomer.mockRejectedValue(new Error('response lost'));

    await expect(
      service.deleteBoundCustomer({ stripeCustomerId: CUSTOMER_ID, userId: USER_ID }),
    ).resolves.toEqual({ providerOutcome: 'deleted' });
    expect(retrieveCustomer).toHaveBeenCalledTimes(2);
  });

  it('期限切れCustomer作成をexact metadata検索してprofileへbindする', async () => {
    const { db, rpc } = createDb([{ data: CUSTOMER_ID, error: null }]);
    const { searchCustomers, service } = createStripe();
    searchCustomers.mockResolvedValue({
      data: [liveCustomer()],
      next_page: null,
    });

    await expect(
      service.recoverProvisionedCustomer(db, {
        instruction: { operationId: OPERATION_ID, result: 'recover' },
        userId: USER_ID,
      }),
    ).resolves.toBeUndefined();

    expect(searchCustomers).toHaveBeenCalledWith({
      limit: 100,
      query: `metadata['supabase_user_id']:'${USER_ID}'`,
    });
    expect(rpc).toHaveBeenCalledWith('complete_billing_customer_provisioning_v2', {
      p_operation_id: OPERATION_ID,
      p_provider_customer_id: CUSTOMER_ID,
      p_user_id: USER_ID,
    });
  });

  it('期限切れCustomerが無ければexact operationだけをabandonする', async () => {
    const { db, rpc } = createDb([{ data: true, error: null }]);
    const { searchCustomers, service } = createStripe();
    searchCustomers.mockResolvedValue({ data: [], next_page: null });

    await expect(
      service.recoverProvisionedCustomer(db, {
        instruction: { operationId: OPERATION_ID, result: 'recover' },
        userId: USER_ID,
      }),
    ).resolves.toBeUndefined();

    expect(rpc).toHaveBeenCalledWith('abandon_billing_customer_provisioning_v2', {
      p_operation_id: OPERATION_ID,
      p_user_id: USER_ID,
    });
  });

  it('期限切れCustomerが複数ならDB receiptを変更せずfail closedにする', async () => {
    const { db, rpc } = createDb([]);
    const { searchCustomers, service } = createStripe();
    searchCustomers
      .mockResolvedValueOnce({
        data: [liveCustomer('cus_first')],
        next_page: 'page-2',
      })
      .mockResolvedValueOnce({
        data: [liveCustomer('cus_second')],
        next_page: null,
      });

    await expect(
      service.recoverProvisionedCustomer(db, {
        instruction: { operationId: OPERATION_ID, result: 'recover' },
        userId: USER_ID,
      }),
    ).rejects.toMatchObject({
      code: 'BILLING_ACCOUNT_DELETION_CUSTOMER_RECOVERY_AMBIGUOUS_FAILED',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('terminal receipt cleanupをBilling境界で実行する', async () => {
    const { db, rpc } = createDb([
      {
        data: [{ deleted_count: 7, has_more: true }],
        error: null,
      },
    ]);

    await expect(
      cleanupBillingAccountDeletionTerminalReceipts(db, { limit: 250 }),
    ).resolves.toEqual({
      deleted: 7,
      hasMore: true,
    });
    expect(rpc).toHaveBeenCalledWith('cleanup_billing_account_deletion_terminal_receipts_v2', {
      p_limit: 250,
    });
  });
});
