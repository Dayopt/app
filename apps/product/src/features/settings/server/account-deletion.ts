import 'server-only';

import { createHash } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

import { env } from '@/env';
import type { Database } from '@/lib/database';
import { getStripe } from '@/lib/stripe/client';

const CUSTOMER_RECOVERY_RPC = 'get_account_deletion_customer_recovery_v1' as const;
const COMPLETE_CUSTOMER_PROVISIONING_RPC = 'complete_billing_customer_provisioning_v2' as const;
const ABANDON_CUSTOMER_PROVISIONING_RPC = 'abandon_billing_customer_provisioning_v2' as const;
const STRIPE_PAGE_LIMIT = 100;
const DB_RPC_TIMEOUT_MS = 4_000;
const CUSTOMER_ID_PATTERN = /^cus_[A-Za-z0-9_]+$/;
const STRIPE_ACCOUNT_ID_PATTERN = /^acct_[A-Za-z0-9_]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CANCELLABLE_SUBSCRIPTION_STATUSES = new Set([
  'active',
  'incomplete',
  'past_due',
  'paused',
  'trialing',
  'unpaid',
]);

type BillingAccountDeletionDatabase = SupabaseClient<Database>;

type StripeProviderIdentity = Readonly<{
  accountId: string;
  livemode: boolean;
}>;

type BillingAccountDeletionRuntime = Readonly<{
  providerIdentity: StripeProviderIdentity;
  stripe: Stripe;
}>;

type BillingAccountDeletionResult = Readonly<{
  providerOutcome: 'deleted' | 'not_present';
}>;

type CustomerRecoveryInstruction =
  | Readonly<{ result: 'none' }>
  | Readonly<{ operationId: string; result: 'recover' }>
  | Readonly<{ result: 'wait' }>;

type BillingCustomerRecoveryResult = Readonly<{
  status: 'completed' | 'contention';
}>;

export class BillingAccountDeletionError extends Error {
  constructor(operation: string, options?: ErrorOptions) {
    super('Billing account deletion failed', options);
    this.name = 'BillingAccountDeletionError';
    this.code = `BILLING_ACCOUNT_DELETION_${operation.toUpperCase()}_FAILED`;
  }

  readonly code: string;
}

function deletionFailure(operation: string, cause?: unknown): BillingAccountDeletionError {
  return new BillingAccountDeletionError(operation, cause === undefined ? undefined : { cause });
}

function idempotencyKey(
  userId: string,
  resourceKind: 'checkout' | 'customer' | 'subscription',
  resourceId: string,
): string {
  const digest = createHash('sha256')
    .update(`dayopt-account-deletion-v2:${userId}:${resourceKind}:${resourceId}`)
    .digest('hex');
  return `dayopt-account-deletion-v2-${resourceKind}-${digest}`;
}

function readConfiguredStripeRuntime(): BillingAccountDeletionRuntime {
  const stripe = getStripe();
  const accountId = env.STRIPE_ACCOUNT_ID?.trim();
  const livemode = env.STRIPE_LIVEMODE;

  if (
    stripe === null ||
    accountId === undefined ||
    !STRIPE_ACCOUNT_ID_PATTERN.test(accountId) ||
    (livemode !== 'true' && livemode !== 'false')
  ) {
    throw deletionFailure('configuration');
  }

  return {
    providerIdentity: {
      accountId,
      livemode: livemode === 'true',
    },
    stripe,
  };
}

async function listOpenCheckoutSessions(
  stripe: Stripe,
  customerId: string,
): Promise<Stripe.Checkout.Session[]> {
  const sessions = new Map<string, Stripe.Checkout.Session>();
  let startingAfter: string | undefined;

  while (true) {
    const page = await stripe.checkout.sessions.list({
      customer: customerId,
      limit: STRIPE_PAGE_LIMIT,
      status: 'open',
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    for (const session of page.data) sessions.set(session.id, session);
    if (!page.has_more)
      return [...sessions.values()].sort((left, right) => left.id.localeCompare(right.id));

    const lastSession = page.data.at(-1);
    if (!lastSession) throw deletionFailure('checkout_pagination');
    startingAfter = lastSession.id;
  }
}

async function expireOpenCheckoutSessions(
  stripe: Stripe,
  input: { customerId: string; userId: string },
): Promise<void> {
  const sessions = await listOpenCheckoutSessions(stripe, input.customerId);
  for (const session of sessions) {
    await stripe.checkout.sessions.expire(
      session.id,
      {},
      {
        idempotencyKey: idempotencyKey(input.userId, 'checkout', session.id),
      },
    );
  }
}

async function listSubscriptions(
  stripe: Stripe,
  customerId: string,
): Promise<Stripe.Subscription[]> {
  const subscriptions = new Map<string, Stripe.Subscription>();
  let startingAfter: string | undefined;

  while (true) {
    const page = await stripe.subscriptions.list({
      customer: customerId,
      limit: STRIPE_PAGE_LIMIT,
      status: 'all',
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    for (const subscription of page.data) subscriptions.set(subscription.id, subscription);
    if (!page.has_more) {
      return [...subscriptions.values()].sort((left, right) => left.id.localeCompare(right.id));
    }

    const lastSubscription = page.data.at(-1);
    if (!lastSubscription) throw deletionFailure('subscription_pagination');
    startingAfter = lastSubscription.id;
  }
}

function assertLiveCustomerOwnership(
  customer: Stripe.Customer,
  input: {
    providerIdentity: StripeProviderIdentity;
    requireUserMetadata: boolean;
    userId: string;
  },
): void {
  if (customer.livemode !== input.providerIdentity.livemode) {
    throw deletionFailure('customer_mode');
  }
  if (input.requireUserMetadata && customer.metadata.supabase_user_id !== input.userId) {
    throw deletionFailure('customer_ownership');
  }
}

async function findProvisionedCustomers(
  stripe: Stripe,
  input: { providerIdentity: StripeProviderIdentity; userId: string },
): Promise<Stripe.Customer[]> {
  const customers = new Map<string, Stripe.Customer>();
  let pageToken: string | undefined;

  while (true) {
    const page = await stripe.customers.search({
      limit: STRIPE_PAGE_LIMIT,
      query: `metadata['supabase_user_id']:'${input.userId}'`,
      ...(pageToken ? { page: pageToken } : {}),
    });

    for (const customer of page.data) {
      if (
        customer.metadata.supabase_user_id !== input.userId ||
        customer.livemode !== input.providerIdentity.livemode ||
        !CUSTOMER_ID_PATTERN.test(customer.id)
      ) {
        throw deletionFailure('customer_recovery_identity');
      }
      customers.set(customer.id, customer);
      if (customers.size > 1) throw deletionFailure('customer_recovery_ambiguous');
    }

    if (page.next_page === null) return [...customers.values()];
    if (!page.next_page) throw deletionFailure('customer_recovery_pagination');
    pageToken = page.next_page;
  }
}

async function readCustomerRecoveryInstruction(
  db: BillingAccountDeletionDatabase,
  input: { userId: string },
): Promise<CustomerRecoveryInstruction> {
  const { data, error } = await db
    .rpc(CUSTOMER_RECOVERY_RPC, { p_user_id: input.userId })
    .abortSignal(AbortSignal.timeout(DB_RPC_TIMEOUT_MS));
  if (error) throw deletionFailure('customer_recovery_preflight', error);

  const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
  if (row == null || (row.result !== 'none' && row.result !== 'wait' && row.result !== 'recover')) {
    throw deletionFailure('customer_recovery_preflight_result');
  }
  if (row.result === 'none') {
    if (row.operation_id !== null || row.provider_retry_deadline_at !== null) {
      throw deletionFailure('customer_recovery_preflight_result');
    }
    return { result: 'none' };
  }
  if (
    typeof row.operation_id !== 'string' ||
    !UUID_PATTERN.test(row.operation_id) ||
    typeof row.provider_retry_deadline_at !== 'string' ||
    !Number.isFinite(Date.parse(row.provider_retry_deadline_at))
  ) {
    throw deletionFailure('customer_recovery_preflight_result');
  }
  if (row.result === 'wait') return { result: 'wait' };
  return { operationId: row.operation_id, result: 'recover' };
}

export function createBillingAccountDeletionService(runtime: BillingAccountDeletionRuntime) {
  let providerIdentityVerification: Promise<void> | null = null;

  async function verifyProviderIdentity(): Promise<void> {
    providerIdentityVerification ??= (async () => {
      const [account, balance] = await Promise.all([
        runtime.stripe.accounts.retrieve(),
        runtime.stripe.balance.retrieve(),
      ]);
      if (
        account.id !== runtime.providerIdentity.accountId ||
        balance.livemode !== runtime.providerIdentity.livemode
      ) {
        throw deletionFailure('provider_identity');
      }
    })();
    return providerIdentityVerification;
  }

  async function retrieveBoundCustomer(input: {
    customerId: string;
    requireUserMetadata: boolean;
    userId: string;
  }): Promise<Stripe.Customer | Stripe.DeletedCustomer> {
    await verifyProviderIdentity();
    const customer = await runtime.stripe.customers.retrieve(input.customerId);
    if (!('deleted' in customer)) {
      assertLiveCustomerOwnership(customer, {
        providerIdentity: runtime.providerIdentity,
        requireUserMetadata: input.requireUserMetadata,
        userId: input.userId,
      });
    }
    return customer;
  }

  return {
    async quiesceBoundCustomer(input: {
      requireUserMetadata?: boolean;
      stripeCustomerId: string | null;
      userId: string;
    }): Promise<void> {
      if (input.stripeCustomerId === null) return;
      if (!CUSTOMER_ID_PATTERN.test(input.stripeCustomerId)) {
        throw deletionFailure('customer_identity');
      }

      try {
        const customer = await retrieveBoundCustomer({
          customerId: input.stripeCustomerId,
          requireUserMetadata: input.requireUserMetadata ?? true,
          userId: input.userId,
        });
        if ('deleted' in customer && customer.deleted) return;
        await expireOpenCheckoutSessions(runtime.stripe, {
          customerId: input.stripeCustomerId,
          userId: input.userId,
        });
      } catch (error) {
        if (error instanceof BillingAccountDeletionError) throw error;
        throw deletionFailure('customer_quiesce', error);
      }
    },

    async deleteBoundCustomer(input: {
      requireUserMetadata?: boolean;
      stripeCustomerId: string | null;
      userId: string;
    }): Promise<BillingAccountDeletionResult> {
      if (input.stripeCustomerId === null) return { providerOutcome: 'not_present' };
      if (!CUSTOMER_ID_PATTERN.test(input.stripeCustomerId)) {
        throw deletionFailure('customer_identity');
      }

      const customerId = input.stripeCustomerId;
      try {
        const customer = await retrieveBoundCustomer({
          customerId,
          requireUserMetadata: input.requireUserMetadata ?? true,
          userId: input.userId,
        });
        if ('deleted' in customer && customer.deleted) {
          return { providerOutcome: 'deleted' };
        }

        await expireOpenCheckoutSessions(runtime.stripe, {
          customerId,
          userId: input.userId,
        });

        const subscriptions = await listSubscriptions(runtime.stripe, customerId);
        for (const subscription of subscriptions) {
          if (!CANCELLABLE_SUBSCRIPTION_STATUSES.has(subscription.status)) continue;

          await runtime.stripe.subscriptions.cancel(
            subscription.id,
            {},
            {
              idempotencyKey: idempotencyKey(input.userId, 'subscription', subscription.id),
            },
          );
        }

        try {
          await runtime.stripe.customers.del(
            customerId,
            {},
            {
              idempotencyKey: idempotencyKey(input.userId, 'customer', customerId),
            },
          );
        } catch (error) {
          const reconciled = await retrieveBoundCustomer({
            customerId,
            requireUserMetadata: input.requireUserMetadata ?? true,
            userId: input.userId,
          });
          if ('deleted' in reconciled && reconciled.deleted) {
            return { providerOutcome: 'deleted' };
          }
          throw deletionFailure('customer_delete', error);
        }

        const verified = await retrieveBoundCustomer({
          customerId,
          requireUserMetadata: input.requireUserMetadata ?? true,
          userId: input.userId,
        });
        if (!('deleted' in verified) || !verified.deleted) {
          throw deletionFailure('customer_verification');
        }
        return { providerOutcome: 'deleted' };
      } catch (error) {
        if (error instanceof BillingAccountDeletionError) throw error;
        throw deletionFailure('provider', error);
      }
    },

    async recoverProvisionedCustomer(
      db: BillingAccountDeletionDatabase,
      input: {
        instruction: Extract<CustomerRecoveryInstruction, { result: 'recover' }>;
        userId: string;
      },
    ): Promise<void> {
      try {
        await verifyProviderIdentity();
        const customers = await findProvisionedCustomers(runtime.stripe, {
          providerIdentity: runtime.providerIdentity,
          userId: input.userId,
        });

        if (customers.length === 0) {
          const { data, error } = await db
            .rpc(ABANDON_CUSTOMER_PROVISIONING_RPC, {
              p_operation_id: input.instruction.operationId,
              p_user_id: input.userId,
            })
            .abortSignal(AbortSignal.timeout(DB_RPC_TIMEOUT_MS));
          if (error) throw deletionFailure('customer_recovery_abandon', error);
          if (data !== true) throw deletionFailure('customer_recovery_abandon_result');
          return;
        }

        const customer = customers[0];
        if (customer === undefined) throw deletionFailure('customer_recovery_result');
        const { data, error } = await db
          .rpc(COMPLETE_CUSTOMER_PROVISIONING_RPC, {
            p_operation_id: input.instruction.operationId,
            p_provider_customer_id: customer.id,
            p_user_id: input.userId,
          })
          .abortSignal(AbortSignal.timeout(DB_RPC_TIMEOUT_MS));
        if (error) throw deletionFailure('customer_recovery_complete', error);
        if (data !== customer.id) throw deletionFailure('customer_recovery_complete_result');
      } catch (error) {
        if (error instanceof BillingAccountDeletionError) throw error;
        throw deletionFailure('customer_recovery_provider', error);
      }
    },
  };
}

export async function recoverBillingCustomerBeforeAccountDeletion(
  db: BillingAccountDeletionDatabase,
  input: { userId: string },
): Promise<BillingCustomerRecoveryResult> {
  if (!UUID_PATTERN.test(input.userId)) throw deletionFailure('user_identity');

  const instruction = await readCustomerRecoveryInstruction(db, input);
  if (instruction.result === 'none') return { status: 'completed' };
  if (instruction.result === 'wait') return { status: 'contention' };

  const service = createBillingAccountDeletionService(readConfiguredStripeRuntime());
  await service.recoverProvisionedCustomer(db, {
    instruction,
    userId: input.userId,
  });
  return { status: 'completed' };
}

export async function quiesceBoundBillingAccountData(input: {
  stripeCustomerId: string | null;
  userId: string;
}): Promise<void> {
  if (input.stripeCustomerId === null) return;
  const service = createBillingAccountDeletionService(readConfiguredStripeRuntime());
  return service.quiesceBoundCustomer(input);
}

export async function deleteBoundBillingAccountData(input: {
  stripeCustomerId: string | null;
  userId: string;
}): Promise<BillingAccountDeletionResult> {
  if (input.stripeCustomerId === null) return { providerOutcome: 'not_present' };
  const service = createBillingAccountDeletionService(readConfiguredStripeRuntime());
  return service.deleteBoundCustomer(input);
}
